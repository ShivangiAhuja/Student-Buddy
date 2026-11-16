from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .serializers import RegisterSerializer

User = get_user_model()
# Test fixture only, never a deployment credential.
PASSWORD = "Maple!River-28-Lantern"


class AccountsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user("alice", "alice@example.com", PASSWORD)
        cls.bob = User.objects.create_user("bob", "bob@example.com", PASSWORD)

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def post(self, endpoint, data, **extra):
        return self.client.post(reverse(f"accounts:{endpoint}"), data, format="json", **extra)

    def registration(self, **changes):
        return {
            "username": "new_student", "email": "NEW@example.com",
            "password": PASSWORD, "password_confirmation": PASSWORD, **changes,
        }

    def authenticate(self, user=None):
        refresh = RefreshToken.for_user(user or self.alice)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        return refresh

    def test_registration_hashes_password_and_excludes_secrets_and_tokens(self):
        response = self.post("register", self.registration())
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), {"id", "username", "email"})
        user = User.objects.get(pk=response.data["id"])
        self.assertEqual(user.email, "new@example.com")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertIn("no-store", response["Cache-Control"])

    def test_duplicate_username_and_case_insensitive_email_rejected(self):
        for changes, field in [({"username": "alice"}, "username"), ({"email": "ALICE@example.com"}, "email")]:
            with self.subTest(field=field):
                response = self.post("register", self.registration(**changes))
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(User.objects.count(), 2)

    def test_email_uniqueness_is_also_enforced_by_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user("other", "ALICE@example.com", PASSWORD)

    def test_racing_registration_integrity_error_is_validation_error(self):
        serializer = RegisterSerializer(data=self.registration())
        self.assertTrue(serializer.is_valid())
        with patch.object(User.objects, "create_user", side_effect=IntegrityError):
            from rest_framework.exceptions import ValidationError
            with self.assertRaises(ValidationError):
                serializer.save()

    def test_password_validators_and_confirmation(self):
        for password in ["short", "password", "123456789012", "new_student"]:
            with self.subTest(password_case=password):
                response = self.post("register", self.registration(password=password, password_confirmation=password))
                self.assertEqual(response.status_code, 400)
                self.assertIn("password", response.data)
        cache.clear()
        response = self.post("register", self.registration(password_confirmation="different"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("password_confirmation", response.data)
        self.assertEqual(User.objects.count(), 2)

    def test_required_fields_email_and_username_validation(self):
        cases = [{}, self.registration(email="bad-email"), self.registration(username="bad name"),
                 self.registration(email=""), self.registration(password="", password_confirmation="")]
        for payload in cases:
            with self.subTest(payload_fields=list(payload)):
                self.assertEqual(self.post("register", payload).status_code, 400)
        self.assertEqual(User.objects.count(), 2)

    def test_registration_cannot_grant_staff_or_superuser(self):
        response = self.post("register", self.registration(is_staff=True, is_superuser=True))
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(pk=response.data["id"])
        self.assertFalse(user.is_staff or user.is_superuser)

    def test_login_returns_valid_tokens_with_configured_lifetimes(self):
        response = self.post("login", {"username": "alice", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"access", "refresh"})
        access, refresh = AccessToken(response.data["access"]), RefreshToken(response.data["refresh"])
        self.assertEqual(str(access["user_id"]), str(self.alice.pk))
        self.assertEqual(str(refresh["user_id"]), str(self.alice.pk))
        self.assertEqual(access["exp"] - access["iat"], int(api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()))
        self.assertEqual(refresh["exp"] - refresh["iat"], int(api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()))
        self.assertNotIn("email", access.payload)
        self.assertNotIn("password", access.payload)

    def test_invalid_login_has_same_response_for_unknown_and_existing_users(self):
        known = self.post("login", {"username": "alice", "password": "wrong"})
        unknown = self.post("login", {"username": "unknown", "password": "wrong"})
        self.assertEqual(known.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(known.data, unknown.data)
        self.assertNotIn("access", known.data)

    def test_login_preserves_password_whitespace(self):
        password = " " + PASSWORD + " "
        user = User.objects.create_user("spaces", "spaces@example.com", password)
        self.assertEqual(self.post("login", {"username": user.username, "password": password}).status_code, 200)

    def test_inactive_user_cannot_login_or_use_tokens(self):
        refresh = self.authenticate()
        self.alice.is_active = False
        self.alice.save()
        self.assertEqual(self.post("login", {"username": "alice", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.client.get(reverse("accounts:profile")).status_code, 401)
        self.client.credentials()
        self.assertEqual(self.post("refresh", {"refresh": str(refresh)}).status_code, 401)

    def test_refresh_rotates_and_blacklists_previous_token(self):
        old = str(RefreshToken.for_user(self.alice))
        response = self.post("refresh", {"refresh": old})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"access", "refresh"})
        self.assertNotEqual(response.data["refresh"], old)
        self.assertEqual(self.post("refresh", {"refresh": old}).status_code, 401)
        self.assertEqual(self.post("refresh", {"refresh": response.data["refresh"]}).status_code, 200)

    def test_invalid_expired_and_access_tokens_cannot_refresh(self):
        expired = RefreshToken.for_user(self.alice)
        expired.set_exp(from_time=timezone.now() - timedelta(days=2), lifetime=timedelta(seconds=1))
        for token in ["invalid", str(expired), str(AccessToken.for_user(self.alice))]:
            with self.subTest(token_kind=token[:7]):
                self.assertEqual(self.post("refresh", {"refresh": token}).status_code, 401)
        self.assertEqual(self.post("refresh", {}).status_code, 400)

    def test_deleted_user_refresh_is_rejected_without_server_error(self):
        token = str(RefreshToken.for_user(self.alice))
        self.alice.delete()
        self.assertEqual(self.post("refresh", {"refresh": token}).status_code, 401)

    def test_profile_requires_jwt_and_returns_only_current_user(self):
        self.assertEqual(self.client.get(reverse("accounts:profile")).status_code, 401)
        for user in [self.alice, self.bob]:
            self.authenticate(user)
            response = self.client.get(reverse("accounts:profile"), {"id": self.bob.pk, "user_id": self.bob.pk})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, {"id": user.pk, "username": user.username, "email": user.email})
            self.assertIn("no-store", response["Cache-Control"])

    def test_profile_rejects_session_auth_invalid_expired_or_refresh_token(self):
        self.client.force_login(self.alice)
        self.assertEqual(self.client.get(reverse("accounts:profile")).status_code, 401)
        self.client.logout()
        expired = AccessToken.for_user(self.alice)
        expired.set_exp(from_time=timezone.now() - timedelta(days=1), lifetime=timedelta(seconds=1))
        for token in ["invalid", str(expired), str(RefreshToken.for_user(self.alice))]:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            self.assertEqual(self.client.get(reverse("accounts:profile")).status_code, 401)

    def test_logout_blacklists_refresh_but_access_remains_valid(self):
        refresh = self.authenticate()
        response = self.post("logout", {"refresh": str(refresh)})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get(reverse("accounts:profile")).status_code, 200)
        self.client.credentials()
        self.assertEqual(self.post("refresh", {"refresh": str(refresh)}).status_code, 401)

    def test_logout_requires_authentication_and_ownership(self):
        bob_token = str(RefreshToken.for_user(self.bob))
        self.assertEqual(self.post("logout", {"refresh": bob_token}).status_code, 401)
        self.authenticate(self.alice)
        self.assertEqual(self.post("logout", {"refresh": bob_token}).status_code, 400)
        self.client.credentials()
        self.assertEqual(self.post("refresh", {"refresh": bob_token}).status_code, 200)

    def test_logout_bad_missing_expired_and_blacklisted_tokens(self):
        refresh = self.authenticate()
        expired = RefreshToken.for_user(self.alice)
        expired.set_exp(from_time=timezone.now() - timedelta(days=2), lifetime=timedelta(seconds=1))
        for payload in [{}, {"refresh": "invalid"}, {"refresh": str(expired)}, {"refresh": str(refresh.access_token)}]:
            self.assertEqual(self.post("logout", payload).status_code, 400)
        self.assertEqual(self.post("logout", {"refresh": str(refresh)}).status_code, 204)
        self.assertEqual(self.post("logout", {"refresh": str(refresh)}).status_code, 400)

    def test_auth_throttles_reject_burst_requests_and_ignore_spoofed_forwarding(self):
        # Small test-only limits avoid depending on local environment rates.
        from .throttles import AuthIPThrottle
        with patch.object(AuthIPThrottle, "THROTTLE_RATES", {scope: "2/minute" for scope in ["register", "login", "refresh", "logout"]}):
            for endpoint in ["register", "login", "refresh", "logout"]:
                cache.clear()
                if endpoint == "logout":
                    self.authenticate()
                for i in range(2):
                    response = self.post(endpoint, {}, HTTP_X_FORWARDED_FOR=f"192.0.2.{i}")
                    self.assertEqual(response.status_code, 400)
                response = self.post(endpoint, {}, HTTP_X_FORWARDED_FOR="192.0.2.99")
                self.assertEqual(response.status_code, 429)
                self.assertIn("Retry-After", response)

    def test_public_endpoints_ignore_stale_authorization_headers(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer stale-token")
        self.assertEqual(self.client.get("/api/health/").status_code, 200)
        self.assertEqual(self.post("register", self.registration()).status_code, 201)
        self.assertEqual(self.post("login", {"username": "alice", "password": PASSWORD}).status_code, 200)
        refresh = str(RefreshToken.for_user(self.alice))
        self.assertEqual(self.post("refresh", {"refresh": refresh}).status_code, 200)
