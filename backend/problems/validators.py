import re
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError


def normalize_problem_url(value):
    """Return (canonical HTTPS URL, slug); never fetch any external resource."""
    if not isinstance(value, str) or len(value) > 2048:
        raise ValidationError("Provide a supported LeetCode problem URL.")
    value = value.strip()
    if re.search(r"[\s\\\x00-\x1f\x7f]", value):
        raise ValidationError("Invalid characters in problem URL.")
    try:
        parts = urlsplit(value)
        if (parts.scheme.lower() not in {"http", "https"}
                or parts.hostname not in {"leetcode.com", "www.leetcode.com"}
                or parts.username is not None or parts.password is not None
                or parts.port not in {None, 443 if parts.scheme.lower() == "https" else 80}):
            raise ValueError
    except ValueError as exc:
        raise ValidationError("Only LeetCode problem URLs are supported.") from exc
    match = re.fullmatch(
        r"/problems/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/(?:description|editorial|solutions|submissions))?/?",
        parts.path, flags=re.IGNORECASE,
    )
    if not match or len(match[1]) > 200:
        raise ValidationError("URL must identify a supported LeetCode problem page.")
    slug = match[1].lower()
    return f"https://leetcode.com/problems/{slug}/", slug
