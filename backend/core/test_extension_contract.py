"""Real loopback HTTP contract, isolated DB, mocked Groq, no browser required."""
import shutil
import subprocess
from pathlib import Path
from unittest import skipUnless
from unittest.mock import patch

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from ai_engine.models import MentorRequest
from ai_engine.provider import Completion


@skipUnless(shutil.which("node"), "Node.js is needed for the extension HTTP contract test.")
@override_settings(GROQ_API_KEY="test-only-contract-provider-key")
class ExtensionContractTests(LiveServerTestCase):
    host = "127.0.0.1"

    def test_extension_registration_login_mentor_history_logout_over_http(self):
        cache.clear()
        self.addCleanup(cache.clear)
        script = Path(__file__).resolve().parents[2] / "tests" / "backend-contract-client.cjs"
        with patch("ai_engine.services.provider.generate", return_value=Completion("Contract mentor response.")) as provider:
            result = subprocess.run([shutil.which("node"), str(script), self.live_server_url],
                                    capture_output=True, text=True, timeout=60, check=False)
        # The client prints fixed summaries only, never credentials or tokens.
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(MentorRequest.objects.filter(status="succeeded").count(), 2)
