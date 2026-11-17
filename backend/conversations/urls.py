from django.urls import path
from .views import ConversationDetailView, ConversationListCreateView, MessageListView

app_name = "conversations"
urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view(), name="list"),
    path("conversations/<int:pk>/", ConversationDetailView.as_view(), name="detail"),
    path("conversations/<int:pk>/messages/", MessageListView.as_view(), name="messages"),
]
