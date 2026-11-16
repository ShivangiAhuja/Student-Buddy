from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Public liveness probe, without database access or configuration details."""
    response = Response({"status": "ok", "service": "student-buddy-backend"})
    response["Cache-Control"] = "no-store"
    return response
