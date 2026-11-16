from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient


class HealthTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("core:health")

    def test_public_health_returns_json_without_database_access(self):
        self.assertEqual(self.url, "/api/health/")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), {"status": "ok", "service": "student-buddy-backend"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_write_methods_are_rejected(self):
        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url, {}, format="json")
                self.assertEqual(response.status_code, 405)

    def test_invalid_host_is_rejected(self):
        response = self.client.get(self.url, HTTP_HOST="untrusted.example")
        self.assertEqual(response.status_code, 400)
