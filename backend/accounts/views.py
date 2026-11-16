from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.cache import never_cache
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import (
    LoginSerializer, LogoutSerializer, ProfileSerializer, RefreshSerializer, RegisterSerializer,
)
from .throttles import AuthIPThrottle


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters("password", "password_confirmation", "refresh"), name="dispatch")
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthIPThrottle]
    throttle_scope = "register"


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters("password"), name="dispatch")
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthIPThrottle]
    throttle_scope = "login"


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters("refresh"), name="dispatch")
class RefreshView(TokenRefreshView):
    serializer_class = RefreshSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthIPThrottle]
    throttle_scope = "refresh"


@method_decorator(never_cache, name="dispatch")
class ProfileView(generics.RetrieveAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        # Never take a user ID from query parameters or the request body.
        return self.request.user


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters("refresh"), name="dispatch")
class LogoutView(APIView):
    throttle_classes = [AuthIPThrottle]
    throttle_scope = "logout"

    def post(self, request):
        serializer = LogoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
