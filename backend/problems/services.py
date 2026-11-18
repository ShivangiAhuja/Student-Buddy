from .models import Problem
from .validators import normalize_problem_url


def get_or_create_problem(data):
    """Reuse canonical metadata without letting callers overwrite shared text."""
    url, slug = normalize_problem_url(data["url"])
    return Problem.objects.get_or_create(
        url=url, defaults={"slug": slug, "title": data["title"], "statement": data["statement"]},
    )
