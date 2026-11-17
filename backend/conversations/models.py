from django.conf import settings
from django.core.validators import MaxLengthValidator
from django.db import models

LANGUAGES = [(language, language) for language in (
    "Python", "Java", "C++", "JavaScript", "TypeScript", "C", "C#", "Go", "Ruby",
    "Swift", "Kotlin", "Rust", "PHP", "Scala",
)]
MAX_MESSAGE_CHARACTERS = 8000


class Conversation(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations")
    problem = models.ForeignKey("problems.Problem", on_delete=models.PROTECT, related_name="conversations")
    language = models.CharField(max_length=20, choices=LANGUAGES)
    last_sequence = models.PositiveIntegerField(default=0, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["owner", "-updated_at", "-id"], name="conv_owner_updated_idx")]
        constraints = [models.CheckConstraint(
            condition=models.Q(language__in=[language for language, _ in LANGUAGES]), name="conv_valid_language",
        )]


class Message(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=9, choices=Role.choices)
    content = models.TextField(validators=[MaxLengthValidator(MAX_MESSAGE_CHARACTERS)])
    sequence = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sequence", "id"]
        constraints = [
            models.UniqueConstraint(fields=["conversation", "sequence"], name="message_unique_sequence"),
            models.CheckConstraint(condition=models.Q(sequence__gte=1), name="message_positive_sequence"),
            models.CheckConstraint(condition=models.Q(role__in=["user", "assistant"]), name="message_valid_role"),
            models.CheckConstraint(condition=~models.Q(content=""), name="message_not_empty"),
        ]
