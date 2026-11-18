from rest_framework import serializers

from conversations.models import LANGUAGES, MAX_MESSAGE_CHARACTERS
from core.api import StrictInputMixin
from problems.serializers import ProblemInputSerializer


class MentorInputSerializer(StrictInputMixin, serializers.Serializer):
    request_id = serializers.UUIDField()
    conversation_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    problem_id = serializers.IntegerField(min_value=1, required=False)
    problem = ProblemInputSerializer(required=False)
    language = serializers.ChoiceField(choices=LANGUAGES)
    user_thought = serializers.CharField(max_length=6000, required=False, allow_blank=True, default="", trim_whitespace=False)
    code = serializers.CharField(max_length=6000, required=False, allow_blank=True, default="", trim_whitespace=False)

    def validate(self, attrs):
        if "problem_id" in attrs and "problem" in attrs:
            raise serializers.ValidationError("Provide problem_id or problem, not both.")
        if not attrs.get("conversation_id") and "problem_id" not in attrs and "problem" not in attrs:
            raise serializers.ValidationError("A new conversation requires problem_id or problem.")
        if "hint_level" not in attrs and attrs.get("action") != "solution" and not (attrs["user_thought"].strip() or attrs["code"].strip()):
            raise serializers.ValidationError("Provide a thought, question, or code.")
        if len(user_message(attrs)) > MAX_MESSAGE_CHARACTERS:
            raise serializers.ValidationError("Combined thought, code, and action exceed the message limit.")
        return attrs


class HintInputSerializer(MentorInputSerializer):
    hint_level = serializers.IntegerField(min_value=1, max_value=4)


class ChatInputSerializer(MentorInputSerializer):
    action = serializers.ChoiceField(choices=["discuss", "debug", "explain", "solution"], default="discuss")


def user_message(data):
    action = f"hint level {data['hint_level']}" if "hint_level" in data else data["action"]
    text = f"Mentor request: {action}\nStudent: {data['user_thought']}"
    if data["code"]:
        text += "\nStudent code:\n" + data["code"]
    return text
