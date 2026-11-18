from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .errors import MentorError
from .models import DailyUsage


def reserve_daily_request(owner):
    """Called inside the short, owner-serialized reservation transaction.

    Reservations count as attempts, including provider failures and worker crashes.
    Idempotent replays are checked before this function is called.
    """
    usage, _ = DailyUsage.objects.get_or_create(owner=owner, day=timezone.now().date())
    if not DailyUsage.objects.filter(pk=usage.pk, requests__lt=settings.AI_DAILY_REQUEST_LIMIT).update(requests=F("requests") + 1):
        raise MentorError("quota_exceeded")
