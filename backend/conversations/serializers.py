from rest_framework import serializers

from core.api import StrictInputMixin
from problems.models import Problem
from problems.serializers import ProblemSerializer
from .models import Conversation, LANGUAGES, Message


class ConversationCreateSerializer(StrictInputMixin, serializers.ModelSerializer):
    problem_id = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all(), source="problem")
    language = serializers.ChoiceField(choices=LANGUAGES)

    class Meta:
        model = Conversation
        fields = ("problem_id", "language")


class ConversationSerializer(serializers.ModelSerializer):
    problem = ProblemSerializer(read_only=True)

    class Meta:
        model = Conversation
        fields = ("id", "problem", "language", "created_at", "updated_at")
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ("id", "role", "content", "sequence", "created_at")
        read_only_fields = fields
