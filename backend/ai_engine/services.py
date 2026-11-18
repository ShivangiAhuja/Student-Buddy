import hashlib
import json
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from conversations.models import Conversation, Message
from conversations.services import append_message
from problems.models import Problem
from problems.services import get_or_create_problem
from . import provider
from .errors import MentorError, ProviderError
from .models import ConversationLease, MentorRequest
from .prompts import allows_solution, build_messages
from .serializers import user_message
from .usage import reserve_daily_request


def _lock_owner(owner):
    # A no-op UPDATE acquires a write lock before reads (also on SQLite).
    # On PostgreSQL this is a per-user row lock. No last-login value is changed.
    if not get_user_model().objects.filter(pk=owner.pk).update(last_login=F("last_login")):
        raise Http404


def _mark_failed(run, code):
    run.status = MentorRequest.Status.FAILED
    run.error_code = code
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "error_code", "completed_at"])
    ConversationLease.objects.filter(request=run).delete()


def _resolve_conversation(owner, data):
    if data.get("conversation_id"):
        try:
            conversation = Conversation.objects.select_related("problem").get(pk=data["conversation_id"], owner=owner)
        except Conversation.DoesNotExist as exc:
            raise Http404 from exc
        if conversation.language != data["language"]:
            raise ValidationError({"language": "Language must match this conversation."})
        if "problem_id" in data and data["problem_id"] != conversation.problem_id:
            raise ValidationError({"problem_id": "Problem must match this conversation."})
        if "problem" in data and data["problem"]["url"] != conversation.problem.url:
            raise ValidationError({"problem": "Problem must match this conversation."})
        return conversation
    if "problem_id" in data:
        try:
            problem = Problem.objects.get(pk=data["problem_id"])
        except Problem.DoesNotExist as exc:
            raise ValidationError({"problem_id": "Unknown problem."}) from exc
    else:
        problem, _ = get_or_create_problem(data["problem"])
    return Conversation.objects.create(owner=owner, problem=problem, language=data["language"])


@transaction.atomic
def reserve(owner, data):
    _lock_owner(owner)
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
    previous = MentorRequest.objects.filter(owner=owner, request_id=data["request_id"]).first()
    if previous:
        if previous.fingerprint != fingerprint:
            raise MentorError("request_conflict")
        if previous.status == MentorRequest.Status.PROCESSING and previous.created_at + timedelta(seconds=settings.AI_LEASE_SECONDS) <= timezone.now():
            _mark_failed(previous, "request_expired")
        return previous, None
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "replace-with-your-groq-api-key" or not settings.GROQ_MODEL:
        raise MentorError("not_configured")
    conversation = _resolve_conversation(owner, data)
    lease = ConversationLease.objects.filter(conversation=conversation).select_related("request").first()
    if lease:
        if lease.expires_at > timezone.now():
            raise MentorError("in_progress", conversation.pk)
        _mark_failed(lease.request, "request_expired")
    messages = build_messages(conversation, owner, data)
    reserve_daily_request(owner)
    run = MentorRequest.objects.create(owner=owner, request_id=data["request_id"], fingerprint=fingerprint,
                                      conversation=conversation, base_sequence=conversation.last_sequence,
                                      model=settings.GROQ_MODEL)
    ConversationLease.objects.create(conversation=conversation, request=run,
                                     expires_at=timezone.now() + timedelta(seconds=settings.AI_LEASE_SECONDS))
    return run, messages


def result_or_error(run):
    if run.status == MentorRequest.Status.PROCESSING:
        raise MentorError("in_progress", run.conversation_id)
    if run.status == MentorRequest.Status.FAILED:
        raise MentorError(run.error_code, run.conversation_id)
    if not run.conversation_id or not run.assistant_message_id:
        raise MentorError("conversation_deleted")
    message = Message.objects.filter(pk=run.assistant_message_id, conversation_id=run.conversation_id,
                                     conversation__owner_id=run.owner_id).first()
    if message is None:
        raise MentorError("conversation_deleted")
    return {"request_id": str(run.request_id), "conversation_id": run.conversation_id,
            "response": message.content}


@transaction.atomic
def fail(run, code):
    _lock_owner(run.owner)
    run.refresh_from_db()
    if run.status == MentorRequest.Status.PROCESSING:
        _mark_failed(run, code)
    return run


@transaction.atomic
def finish(run, completion, data):
    _lock_owner(run.owner)
    run.refresh_from_db()
    if run.status != MentorRequest.Status.PROCESSING:
        return run
    lease = ConversationLease.objects.filter(request=run).first()
    if not run.conversation_id:
        _mark_failed(run, "conversation_deleted")
    elif not lease or lease.expires_at <= timezone.now():
        _mark_failed(run, "request_expired")
    else:
        # Lock/check the parent before appending, even if another trusted service
        # wrote messages without using the AI lease while the provider ran.
        conversation = Conversation.objects.filter(pk=run.conversation_id, owner=run.owner)
        if not conversation.update(last_sequence=F("last_sequence")):
            run.conversation_id = None
            _mark_failed(run, "conversation_deleted")
            return run
        current = conversation.get()
        if current.last_sequence != run.base_sequence:
            _mark_failed(run, "context_changed")
        else:
            append_message(conversation_id=current.pk, owner=run.owner, role="user", content=user_message(data))
            assistant = append_message(conversation_id=current.pk, owner=run.owner, role="assistant", content=completion.text)
            run.status = MentorRequest.Status.SUCCEEDED
            run.assistant_message = assistant
            run.prompt_tokens = completion.prompt_tokens
            run.completion_tokens = completion.completion_tokens
            run.completed_at = timezone.now()
            run.save(update_fields=["status", "assistant_message", "prompt_tokens", "completion_tokens", "completed_at"])
            lease.delete()
    return run


def mentor_turn(owner, data):
    run, messages = reserve(owner, data)
    if messages is None:
        return result_or_error(run)
    try:
        # Both reservation and finish transactions have ended/begun separately.
        completion = provider.generate(messages, allow_solution=allows_solution(data),
                                       hint_level=data.get("hint_level"), model=run.model)
    except ProviderError as exc:
        return result_or_error(fail(run, exc.code))
    return result_or_error(finish(run, completion, data))
