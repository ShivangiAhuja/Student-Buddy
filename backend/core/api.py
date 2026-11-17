"""Small shared utilities used by the Phase 4 JSON APIs only."""
from collections.abc import Mapping
from io import BytesIO

from django.conf import settings
from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = "Request body exceeds the configured size limit."


class BoundedJSONParser(JSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        # Bound the actual stream, rather than trusting Content-Length alone.
        body = stream.read(settings.API_MAX_BODY_BYTES + 1)
        if len(body) > settings.API_MAX_BODY_BYTES:
            raise PayloadTooLarge()
        return super().parse(BytesIO(body), media_type, parser_context)


class StrictInputMixin:
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            writable = {key for key, field in self.fields.items() if not field.read_only}
            unexpected = set(data) - writable
            if unexpected:
                raise serializers.ValidationError({key: "Unexpected field." for key in sorted(unexpected)})
        return super().to_internal_value(data)


class SmallPagePagination(PageNumberPagination):
    page_size = 20
