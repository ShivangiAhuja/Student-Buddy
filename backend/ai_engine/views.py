from django.db import DatabaseError
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import BoundedJSONParser
from .errors import MentorError
from .serializers import ChatInputSerializer, HintInputSerializer
from .services import mentor_turn


@method_decorator(never_cache, name="dispatch")
class MentorView(APIView):
    parser_classes = [BoundedJSONParser]
    throttle_scope = "ai"
    serializer_class = ChatInputSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = mentor_turn(request.user, serializer.validated_data)
        except DatabaseError:
            # A DB failure may happen before or after provider execution. Keep
            # the same idempotency key on retry; never claim the write succeeded.
            raise MentorError("storage_unavailable") from None
        if "hint_level" in serializer.validated_data:
            result["hint_level"] = serializer.validated_data["hint_level"]
        return Response(result)


class HintView(MentorView):
    serializer_class = HintInputSerializer
