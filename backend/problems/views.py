from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import BoundedJSONParser
from .models import Problem
from .serializers import ProblemInputSerializer, ProblemSerializer
from .services import get_or_create_problem


@method_decorator(never_cache, name="dispatch")
class ProblemCreateView(APIView):
    parser_classes = [BoundedJSONParser]
    throttle_scope = "problems"

    def post(self, request):
        serializer = ProblemInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        problem, created = get_or_create_problem(serializer.validated_data)
        return Response(ProblemSerializer(problem).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@method_decorator(never_cache, name="dispatch")
class ProblemDetailView(generics.RetrieveAPIView):
    queryset = Problem.objects.all()
    serializer_class = ProblemSerializer
    throttle_scope = "problems"
