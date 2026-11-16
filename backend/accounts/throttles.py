from rest_framework.throttling import ScopedRateThrottle


class AuthIPThrottle(ScopedRateThrottle):
    """Always limit by peer IP, including authenticated logout requests."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
