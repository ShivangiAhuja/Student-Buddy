from rest_framework.exceptions import APIException

# Only these fixed messages may cross the API boundary; never provider bodies.
ERRORS = {
    "not_configured": (503, "AI service is not configured. Contact the administrator."),
    "quota_exceeded": (429, "Daily AI request limit reached. Try again after midnight UTC."),
    "request_conflict": (409, "This request ID was already used with different input."),
    "in_progress": (409, "A request is already running. Wait before retrying."),
    "request_expired": (409, "The previous request expired. Retry with a new request ID."),
    "context_changed": (409, "Conversation changed during generation. Retry with a new request ID."),
    "conversation_deleted": (410, "The conversation was deleted."),
    "provider_timeout": (504, "AI service timed out. Please try again later."),
    "provider_rate_limit": (503, "AI provider is busy. Please try again later."),
    "model_unavailable": (503, "Configured AI model is unavailable. Contact the administrator."),
    "provider_unavailable": (502, "AI service is unavailable. Please try again later."),
    "invalid_response": (502, "AI service returned an unusable response. Please try again."),
    "storage_unavailable": (503, "Could not save this request. Retry using the same request ID."),
}


class MentorError(APIException):
    def __init__(self, code, conversation_id=None):
        self.status_code, message = ERRORS[code]
        super().__init__({"code": code, "message": message}, code=code)
        if conversation_id is not None:
            self.detail["conversation_id"] = conversation_id


class ProviderError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)
