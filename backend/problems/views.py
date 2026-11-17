from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import BoundedJSONParser
from .models import Problem
from .serializers import ProblemInputSerializer, ProblemSerializer
from .validators import normalize_problem_url


@method_decorator(never_cache, name="dispatch")
class ProblemCreateView(APIView):
    parser_classes = [BoundedJSONParser]
    throttle_scope = "problems"

    def post(self, request):
        serializer = ProblemInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        url, slug = normalize_problem_url(data["url"])
        # Shared metadata is immutable through this API: clients cannot overwrite it.
        problem, created = Problem.objects.get_or_create(
            url=url, defaults={"slug": slug, "title": data["title"], "statement": data["statement"]},
        )
        return Response(ProblemSerializer(problem).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@method_decorator(never_cache, name="dispatch")
class ProblemDetailView(generics.RetrieveAPIView):
    queryset = Problem.objects.all()
    serializer_class = ProblemSerializer
    throttle_scope = "problems"
