from django.urls import path
from .views import HintView, MentorView

app_name = "ai_engine"
urlpatterns = [
    path("hints/", HintView.as_view(), name="hints"),
    path("chat/", MentorView.as_view(), name="chat"),
]
