"""Environment-driven settings for the minimal Student Buddy API."""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Real process environment takes precedence over the local development file.
load_dotenv(BASE_DIR / ".env", override=False)


def env_bool(name, default=False):
    value = os.getenv(name, str(default)).strip().lower()
    if value not in {"true", "false", "1", "0"}:
        raise ImproperlyConfigured(f"{name} must be true, false, 1, or 0.")
    return value in {"true", "1"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY or SECRET_KEY == "replace-with-a-generated-secret-key":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY in backend/.env or the process environment.")
DEBUG = env_bool("DJANGO_DEBUG")
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(",") if host.strip()]
INSTALLED_APPS = [
    "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions",
    "django.contrib.messages", "django.contrib.staticfiles", "rest_framework", "core",
    "rest_framework_simplejwt.token_blacklist", "accounts",
    "problems", "conversations",
    "ai_engine",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [], "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
if DB_ENGINE == "sqlite":
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / os.getenv("DB_NAME", "db.sqlite3"),
    }}
elif DB_ENGINE == "postgresql":
    # Install psycopg and provide these variables when PostgreSQL is introduced.
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "student_buddy"),
        "USER": os.getenv("DB_USER", ""), "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"), "PORT": os.getenv("DB_PORT", "5432"),
        "OPTIONS": {"sslmode": os.getenv("DB_SSLMODE", "require")},
    }}
else:
    raise ImproperlyConfigured("DB_ENGINE must be sqlite or postgresql.")

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# API-only JSON output; future views require explicit access decisions.
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "register": os.getenv("AUTH_REGISTER_RATE", "5/hour"),
        "login": os.getenv("AUTH_LOGIN_RATE", "10/minute"),
        "refresh": os.getenv("AUTH_REFRESH_RATE", "30/minute"),
        "logout": os.getenv("AUTH_LOGOUT_RATE", "30/minute"),
        "problems": os.getenv("PROBLEM_REQUEST_RATE", "60/minute"),
        "conversations": os.getenv("CONVERSATION_REQUEST_RATE", "120/minute"),
        "ai": os.getenv("AI_REQUEST_RATE", "10/minute"),
    },
    # Do not let untrusted X-Forwarded-For headers bypass IP throttles.
    "NUM_PROXIES": 0,
}


def env_positive_int(name, default):
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be a positive integer.") from exc
    if value <= 0:
        raise ImproperlyConfigured(f"{name} must be a positive integer.")
    return value


API_MAX_BODY_BYTES = env_positive_int("API_MAX_BODY_BYTES", 65536)
HISTORY_MAX_MESSAGES = env_positive_int("HISTORY_MAX_MESSAGES", 20)
HISTORY_MAX_CHARACTERS = env_positive_int("HISTORY_MAX_CHARACTERS", 24000)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
GROQ_REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "medium").strip().lower()
if GROQ_REASONING_EFFORT not in {"low", "medium", "high"}:
    raise ImproperlyConfigured("GROQ_REASONING_EFFORT must be low, medium, or high.")
GROQ_TIMEOUT_SECONDS = env_positive_int("GROQ_TIMEOUT_SECONDS", 25)
GROQ_MAX_COMPLETION_TOKENS = env_positive_int("GROQ_MAX_COMPLETION_TOKENS", 4096)
AI_DAILY_REQUEST_LIMIT = env_positive_int("AI_DAILY_REQUEST_LIMIT", 50)
AI_MAX_PROMPT_CHARACTERS = env_positive_int("AI_MAX_PROMPT_CHARACTERS", 60000)
AI_LEASE_SECONDS = env_positive_int("AI_LEASE_SECONDS", 120)
if AI_LEASE_SECONDS <= GROQ_TIMEOUT_SECONDS:
    raise ImproperlyConfigured("AI_LEASE_SECONDS must exceed GROQ_TIMEOUT_SECONDS.")


JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", "").strip()
if len(JWT_SIGNING_KEY) < 32 or JWT_SIGNING_KEY == "replace-with-a-generated-jwt-signing-key":
    raise ImproperlyConfigured("Set JWT_SIGNING_KEY to a separate random secret of at least 32 characters.")
if JWT_SIGNING_KEY == SECRET_KEY:
    raise ImproperlyConfigured("JWT_SIGNING_KEY must differ from DJANGO_SECRET_KEY.")
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_positive_int("JWT_ACCESS_MINUTES", 5)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_positive_int("JWT_REFRESH_DAYS", 1)),
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "ALGORITHM": "HS256",
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
X_FRAME_OPTIONS = "DENY"
# CORS and proxy trust are intentionally not enabled before extension integration.
