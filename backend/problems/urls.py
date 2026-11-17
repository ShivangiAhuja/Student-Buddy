from django.urls import path
from .views import ProblemCreateView, ProblemDetailView

app_name = "problems"
urlpatterns = [
    path("problems/", ProblemCreateView.as_view(), name="create"),
    path("problems/<int:pk>/", ProblemDetailView.as_view(), name="detail"),
]
