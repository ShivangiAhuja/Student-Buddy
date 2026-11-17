from django.http import Http404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, status
from rest_framework.response import Response

from core.api import BoundedJSONParser, SmallPagePagination
from .models import Conversation
from .serializers import ConversationCreateSerializer, ConversationSerializer, MessageSerializer
from .services import ordered_messages


class OwnedConversationMixin:
    throttle_scope = "conversations"
    parser_classes = [BoundedJSONParser]
    pagination_class = SmallPagePagination

    def get_queryset(self):
        return Conversation.objects.filter(owner=self.request.user).select_related("problem")


@method_decorator(never_cache, name="dispatch")
class ConversationListCreateView(OwnedConversationMixin, generics.ListCreateAPIView):
    serializer_class = ConversationSerializer

    def create(self, request, *args, **kwargs):
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save(owner=request.user)
        return Response(ConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name="dispatch")
class ConversationDetailView(OwnedConversationMixin, generics.RetrieveDestroyAPIView):
    serializer_class = ConversationSerializer

    def retrieve(self, request, *args, **kwargs):
        conversation = self.get_object()
        data = self.get_serializer(conversation).data
        # Bound embedded messages; the dedicated paginated endpoint exposes all.
        messages = list(conversation.messages.order_by("-sequence")[:51])
        data["messages_truncated"] = len(messages) > 50
        data["messages"] = MessageSerializer(list(reversed(messages[:50])), many=True).data
        return Response(data)


@method_decorator(never_cache, name="dispatch")
class MessageListView(OwnedConversationMixin, generics.ListAPIView):
    serializer_class = MessageSerializer

    def get_queryset(self):
        try:
            return ordered_messages(conversation_id=self.kwargs["pk"], owner=self.request.user)
        except Conversation.DoesNotExist as exc:
            raise Http404 from exc
