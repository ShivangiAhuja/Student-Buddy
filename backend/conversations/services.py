"""Private persistence boundary for future mentor services. No network calls."""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Conversation, Message, MAX_MESSAGE_CHARACTERS


def append_message(*, conversation_id, owner, role, content):
    if role not in Message.Role.values:
        raise ValidationError("Message role must be user or assistant.")
    if (not isinstance(content, str) or not content.strip()
            or len(content) > MAX_MESSAGE_CHARACTERS or "\x00" in content):
        raise ValidationError(f"Content must contain 1 to {MAX_MESSAGE_CHARACTERS} nonblank characters.")
    with transaction.atomic():
        # First operation is a write: it serializes writers on SQLite as well as
        # PostgreSQL. select_for_update alone would do nothing on SQLite.
        owned = Conversation.objects.filter(pk=conversation_id, owner=owner)
        if not owned.update(last_sequence=F("last_sequence") + 1, updated_at=timezone.now()):
            raise Conversation.DoesNotExist
        sequence = owned.values_list("last_sequence", flat=True).get()
        return Message.objects.create(conversation_id=conversation_id, role=role, content=content, sequence=sequence)


def ordered_messages(*, conversation_id, owner):
    conversation = Conversation.objects.get(pk=conversation_id, owner=owner)
    return conversation.messages.order_by("sequence", "id")


def get_history(*, conversation_id, owner, limit=None, max_characters=None):
    """Newest whole messages within both budgets, returned oldest first.

    Limits are server-controlled. Dropped messages remain in the database.
    If a message cannot fit, stop rather than silently skipping part of context.
    """
    limit = settings.HISTORY_MAX_MESSAGES if limit is None else limit
    max_characters = settings.HISTORY_MAX_CHARACTERS if max_characters is None else max_characters
    for value, ceiling in [(limit, settings.HISTORY_MAX_MESSAGES), (max_characters, settings.HISTORY_MAX_CHARACTERS)]:
        if type(value) is not int or not 1 <= value <= ceiling:
            raise ValidationError("History limits must be positive integers within configured ceilings.")
    newest = ordered_messages(conversation_id=conversation_id, owner=owner).order_by("-sequence")[:limit]
    result, used = [], 0
    for message in newest:
        if used + len(message.content) > max_characters:
            break
        result.append({"role": message.role, "content": message.content})
        used += len(message.content)
    return list(reversed(result))
