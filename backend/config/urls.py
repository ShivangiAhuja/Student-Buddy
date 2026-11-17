from django.urls import include, path

urlpatterns = [
    path("api/", include("core.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("problems.urls")),
    path("api/", include("conversations.urls")),
]
