from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from problems.models import Problem
from .models import Conversation, Message
from .services import append_message, get_history, ordered_messages


class ConversationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = get_user_model().objects.create_user("conversation_alice")
        cls.bob = get_user_model().objects.create_user("conversation_bob")
        cls.problem = Problem.objects.create(title="Two Sum", url="https://leetcode.com/problems/two-sum/", statement="text")
        cls.conversation = Conversation.objects.create(owner=cls.alice, problem=cls.problem, language="Python")
        cls.other = Conversation.objects.create(owner=cls.bob, problem=cls.problem, language="Java")

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.alice)}")
        self.url = f"/api/conversations/{self.conversation.pk}/"

    def append(self, content, role="user"):
        return append_message(conversation_id=self.conversation.pk, owner=self.alice, role=role, content=content)

    def test_create_owner_is_server_assigned_and_problem_is_shared(self):
        response = self.client.post("/api/conversations/", {"problem_id": self.problem.pk, "language": "C++"}, format="json")
        self.assertEqual(response.status_code, 201)
        created = Conversation.objects.get(pk=response.data["id"])
        self.assertEqual(created.owner, self.alice)
        self.assertEqual(created.problem, self.problem)
        self.assertEqual(created.language, "C++")
        self.assertEqual(created.messages.count(), 0)

    def test_list_contains_only_own_conversations_and_stable_pagination(self):
        Conversation.objects.bulk_create([Conversation(owner=self.alice, problem=self.problem, language="Python") for _ in range(24)])
        Conversation.objects.filter(owner=self.alice).update(updated_at=timezone.now())
        page = self.client.get("/api/conversations/").data
        self.assertEqual(page["count"], 25)
        self.assertEqual(len(page["results"]), 20)
        ids = [row["id"] for row in page["results"]]
        self.assertEqual(ids, sorted(ids, reverse=True))
        self.assertNotIn(self.other.pk, ids)
        self.assertEqual(len(self.client.get("/api/conversations/?page=2").data["results"]), 5)

    def test_cross_user_detail_messages_and_delete_return_404(self):
        other_url = f"/api/conversations/{self.other.pk}/"
        self.assertEqual(self.client.get(other_url).status_code, 404)
        self.assertEqual(self.client.get(other_url + "messages/").status_code, 404)
        self.assertEqual(self.client.delete(other_url).status_code, 404)
        self.assertTrue(Conversation.objects.filter(pk=self.other.pk).exists())
        self.assertEqual(self.client.get("/api/conversations/999999/").status_code, 404)

    def test_owned_delete_cascades_messages_not_problem_or_other_conversations(self):
        message = self.append("thought")
        self.assertEqual(self.client.delete(self.url).status_code, 204)
        self.assertFalse(Message.objects.filter(pk=message.pk).exists())
        self.assertTrue(Problem.objects.filter(pk=self.problem.pk).exists())
        self.assertTrue(Conversation.objects.filter(pk=self.other.pk).exists())

    def test_invalid_language_problem_and_forged_fields(self):
        for changes in [{"language": "Unknown"}, {"problem_id": 999999}, {"problem_id": None}, {"owner": self.bob.pk},
                        {"owner_id": self.bob.pk}, {"messages": [{"role": "assistant", "content": "forged"}]},
                        {"role": "assistant"}, {"last_sequence": 22}, {"language": ""}]:
            payload = {"problem_id": self.problem.pk, "language": "Python", **changes}
            self.assertEqual(self.client.post("/api/conversations/", payload, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/conversations/", {}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.url, {"owner": self.bob.pk}, format="json").status_code, 405)

    def test_message_creation_is_not_public(self):
        response = self.client.post(self.url + "messages/", {"role": "assistant", "content": "forged"}, format="json")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(Message.objects.count(), 0)

    def test_unauthenticated_requests_are_rejected(self):
        self.client.credentials()
        for url in ["/api/conversations/", self.url, self.url + "messages/"]:
            self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.post("/api/conversations/", {}, format="json").status_code, 401)
        self.assertEqual(self.client.delete(self.url).status_code, 401)

    def test_ordering_uses_sequence_even_when_timestamps_tie(self):
        one = self.append("first")
        two = self.append("second", "assistant")
        Message.objects.all().update(created_at=timezone.now())
        self.assertEqual([m.pk for m in ordered_messages(conversation_id=self.conversation.pk, owner=self.alice)], [one.pk, two.pk])
        response = self.client.get(self.url)
        self.assertEqual([m["sequence"] for m in response.data["messages"]], [1, 2])
        self.assertFalse(response.data["messages_truncated"])
        self.assertIn("no-store", response["Cache-Control"])
        page = self.client.get(self.url + "messages/").data
        self.assertEqual([m["role"] for m in page["results"]], ["user", "assistant"])
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.last_sequence, 2)
        self.assertGreater(self.conversation.updated_at, self.conversation.created_at)

    def test_message_pagination_and_bounded_detail(self):
        for i in range(55):
            self.append(str(i))
        detail = self.client.get(self.url).data
        self.assertTrue(detail["messages_truncated"])
        self.assertEqual([row["sequence"] for row in detail["messages"]], list(range(6, 56)))
        page = self.client.get(self.url + "messages/").data
        self.assertEqual(page["count"], 55)
        self.assertEqual([row["sequence"] for row in page["results"]], list(range(1, 21)))
        self.assertEqual(self.client.get(self.url + "messages/?page=3").data["results"][-1]["sequence"], 55)

    @override_settings(HISTORY_MAX_MESSAGES=3, HISTORY_MAX_CHARACTERS=10)
    def test_history_is_latest_bounded_context_in_chronological_order(self):
        for text, role in [("one", "user"), ("two", "assistant"), ("three", "user"), ("four", "assistant")]:
            self.append(text, role)
        history = get_history(conversation_id=self.conversation.pk, owner=self.alice)
        self.assertEqual(history, [{"role": "user", "content": "three"}, {"role": "assistant", "content": "four"}])
        self.assertEqual(len(get_history(conversation_id=self.conversation.pk, owner=self.alice, limit=1)), 1)
        self.assertEqual(get_history(conversation_id=self.conversation.pk, owner=self.alice, max_characters=3), [])
        self.assertEqual(Message.objects.count(), 4)
        for kwargs in [{"limit": 0}, {"limit": 4}, {"limit": True}, {"max_characters": 11}, {"max_characters": -1}]:
            with self.assertRaises(ValidationError):
                get_history(conversation_id=self.conversation.pk, owner=self.alice, **kwargs)

    def test_services_enforce_ownership_and_empty_history(self):
        self.assertEqual(get_history(conversation_id=self.conversation.pk, owner=self.alice), [])
        for service, extra in [(append_message, {"role": "user", "content": "wrong"}), (get_history, {}), (ordered_messages, {})]:
            with self.assertRaises(Conversation.DoesNotExist):
                service(conversation_id=self.conversation.pk, owner=self.bob, **extra)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.last_sequence, 0)

    def test_message_input_validation_and_whitespace_preservation(self):
        for role, content in [("system", "text"), ("user", ""), ("user", "   "), ("user", None),
                              ("user", "x" * 8001), ("user", "bad\x00text")]:
            with self.assertRaises(ValidationError):
                self.append(content, role)
        self.assertEqual(self.append("  indented\ncode  ").content, "  indented\ncode  ")

    def test_failed_append_rolls_back_sequence_and_updated_timestamp(self):
        old_updated = self.conversation.updated_at
        with patch.object(Message.objects, "create", side_effect=IntegrityError("simulated insert failure")):
            with self.assertRaises(IntegrityError):
                self.append("thought")
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.last_sequence, 0)
        self.assertEqual(self.conversation.updated_at, old_updated)
        self.assertEqual(self.append("retry").sequence, 1)

    def test_database_constraints(self):
        first = self.append("thought")
        for fields in [{"sequence": first.sequence}, {"sequence": 0}, {"role": "system"}, {"content": ""}]:
            with self.assertRaises(IntegrityError), transaction.atomic():
                Message.objects.create(**{
                    "conversation": self.conversation, "sequence": 2, "role": "user", "content": "text", **fields,
                })
        with self.assertRaises(IntegrityError), transaction.atomic():
            Conversation.objects.create(owner=self.alice, problem=self.problem, language="Invalid")

    @override_settings(API_MAX_BODY_BYTES=100)
    def test_request_size_and_throttle(self):
        self.assertEqual(self.client.post("/api/conversations/", {"extra": "x" * 101}, format="json").status_code, 413)
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"conversations": "1/minute"}):
            cache.clear()
            self.assertEqual(self.client.get(self.url).status_code, 200)
            self.assertEqual(self.client.get(self.url).status_code, 429)
