from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from core.api import BoundedJSONParser, PayloadTooLarge
from .models import Problem
from .validators import normalize_problem_url


class ProblemTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("problem_student")

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}")

    def payload(self, **changes):
        return {"title": "Two Sum", "url": "https://leetcode.com/problems/two-sum/", "statement": "Given an array...", **changes}

    def create(self, **changes):
        return self.client.post("/api/problems/", self.payload(**changes), format="json")

    def test_supported_url_variants_normalize_and_deduplicate(self):
        variants = ["https://leetcode.com/problems/two-sum/", "http://www.leetcode.com/problems/TWO-SUM",
                    "https://LEETCODE.com:443/problems/two-sum/description/?envId=1#example",
                    "https://leetcode.com/problems/two-sum/solutions/"]
        ids = []
        for i, url in enumerate(variants):
            response = self.create(url=url)
            self.assertEqual(response.status_code, 201 if i == 0 else 200)
            self.assertEqual(response.data["url"], "https://leetcode.com/problems/two-sum/")
            self.assertEqual(response.data["slug"], "two-sum")
            ids.append(response.data["id"])
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(Problem.objects.count(), 1)

    def test_invalid_urls_rejected_without_external_requests(self):
        invalid = ["https://evil.example/problems/two-sum/", "https://leetcode.com.evil.example/problems/two-sum/",
                   "https://leetcode.com@evil.example/problems/two-sum/", "https://evil@leetcode.com/problems/two-sum/",
                   "ftp://leetcode.com/problems/two-sum/", "https://leetcode.com:444/problems/two-sum/",
                   "https://leetcode.com/problems/", "https://leetcode.com/problems/two%2fsum/",
                   "https://leetcode.com/problems/../two-sum/", "https://leetcode.com/problems/two-sum/other/",
                   "https://leetcode.com/problems/two-sum/\n", "not a URL", "https://[bad/problems/test/",
                   "https://leetcode.com/problems/two_sum/", "https://leetcode.com/problems/" + "a" * 201]
        # Leading/trailing whitespace is deliberately trimmed; embedded control characters are rejected.
        invalid.remove("https://leetcode.com/problems/two-sum/\n")
        invalid.append("https://leet\ncode.com/problems/two-sum/")
        for url in invalid:
            with self.subTest(url=url):
                self.assertEqual(self.create(url=url).status_code, 400)
        self.assertEqual(Problem.objects.count(), 0)

    def test_problem_metadata_is_not_overwritten_by_other_submissions(self):
        first = self.create()
        second = self.create(title="Changed", statement="Changed")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data, first.data)
        response = self.client.get(f'/api/problems/{first.data["id"]}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["statement"], "Given an array...")
        self.assertEqual(self.client.patch(f'/api/problems/{first.data["id"]}/', {}, format="json").status_code, 405)

    def test_model_normalizes_urls_and_database_enforces_unique_identity(self):
        problem = Problem.objects.create(title="Two Sum", url="http://www.leetcode.com/problems/TWO-SUM", statement="text")
        self.assertEqual(problem.slug, "two-sum")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Problem.objects.create(title="Duplicate", url=problem.url, statement="text")
        with self.assertRaises(ValidationError):
            Problem.objects.create(title="Bad", url="https://evil.example/problems/bad/", statement="text")

    def test_input_validation_and_unknown_fields(self):
        for changes in [{"title": ""}, {"statement": " "}, {"title": "x" * 256}, {"statement": "x" * 30001},
                        {"slug": "forged"}, {"owner": self.user.pk}, {"id": 2}, {"url": "x" * 2049}]:
            self.assertEqual(self.create(**changes).status_code, 400)
        self.assertEqual(self.client.post("/api/problems/", {}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/problems/", [], format="json").status_code, 400)

    @override_settings(API_MAX_BODY_BYTES=100)
    def test_actual_body_size_is_bounded(self):
        self.assertEqual(self.create(statement="x" * 101).status_code, 413)
        with self.assertRaises(PayloadTooLarge):
            BoundedJSONParser().parse(BytesIO(b"x" * 101))

    def test_json_only_and_invalid_json(self):
        self.assertEqual(self.client.post("/api/problems/", self.payload()).status_code, 415)
        self.assertEqual(self.client.post("/api/problems/", '{"title":', content_type="application/json").status_code, 400)

    def test_authentication_and_throttle(self):
        problem = self.create().data
        self.client.credentials()
        self.assertEqual(self.create().status_code, 401)
        self.assertEqual(self.client.get(f'/api/problems/{problem["id"]}/').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}")
        cache.clear()
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"problems": "1/minute"}):
            self.assertEqual(self.create().status_code, 200)
            response = self.create()
            self.assertEqual(response.status_code, 429)
            self.assertIn("Retry-After", response)
