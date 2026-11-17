from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.api import StrictInputMixin
from .models import Problem
from .validators import normalize_problem_url


class ProblemInputSerializer(StrictInputMixin, serializers.Serializer):
    title = serializers.CharField(max_length=255)
    url = serializers.CharField(max_length=2048)
    statement = serializers.CharField(max_length=30000)

    def validate_url(self, value):
        try:
            return normalize_problem_url(value)[0]
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc


class ProblemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Problem
        fields = ("id", "title", "url", "slug", "statement", "created_at", "updated_at")
        read_only_fields = fields
