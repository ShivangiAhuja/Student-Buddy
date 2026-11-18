from django.conf import settings
from django.db import models


class DailyUsage(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    day = models.DateField()
    requests = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner", "day"], name="ai_unique_daily_usage")]


class MentorRequest(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing"
        SUCCEEDED = "succeeded"
        FAILED = "failed"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    request_id = models.UUIDField()
    fingerprint = models.CharField(max_length=64)
    conversation = models.ForeignKey("conversations.Conversation", null=True, on_delete=models.SET_NULL)
    assistant_message = models.ForeignKey("conversations.Message", null=True, on_delete=models.SET_NULL)
    base_sequence = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PROCESSING)
    error_code = models.CharField(max_length=32, blank=True)
    model = models.CharField(max_length=200)
    prompt_tokens = models.PositiveIntegerField(null=True)
    completion_tokens = models.PositiveIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "request_id"], name="ai_unique_user_request"),
            models.CheckConstraint(condition=models.Q(status__in=["processing", "succeeded", "failed"]), name="ai_valid_request_status"),
        ]


class ConversationLease(models.Model):
    conversation = models.OneToOneField("conversations.Conversation", on_delete=models.CASCADE)
    request = models.OneToOneField(MentorRequest, on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
