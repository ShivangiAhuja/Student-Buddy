import json
import re
from dataclasses import dataclass

from django.conf import settings
from groq import Groq, APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

from conversations.models import MAX_MESSAGE_CHARACTERS
from .errors import ProviderError


@dataclass(frozen=True)
class Completion:
    text: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


def parse_completion(result, allow_solution, hint_level=None):
    try:
        choice = result.choices[0]
        if choice.finish_reason != "stop" or choice.message.tool_calls:
            raise ValueError
        raw = choice.message.content
        if not isinstance(raw, str) or len(raw) > 50000:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) != {"response", "contains_full_solution"}:
            raise ValueError
        text, solution = data["response"], data["contains_full_solution"]
        if (not isinstance(text, str) or not text.strip() or len(text) > MAX_MESSAGE_CHARACTERS
                or "\x00" in text or type(solution) is not bool
                or (settings.GROQ_API_KEY and settings.GROQ_API_KEY in text)):
            raise ValueError
        if not allow_solution and solution:
            raise ValueError
        if not allow_solution and re.search(
            r"(?m)^\s*(?:class\s+Solution\b|def\s+\w+\s*\(|(?:public\s+)?(?:static\s+)?(?:int|void)\s+\w+\s*\()", text,
        ):
            raise ValueError
        if hint_level in {1, 2} and ("```" in text or "~~~" in text):
            raise ValueError
        if hint_level == 3:
            inside_fence = False
            for marker, label in re.findall(r"(?m)^(```|~~~)([^\n]*)", text):
                if not inside_fence and label.strip().lower() not in {"pseudocode", "text"}:
                    raise ValueError
                inside_fence = not inside_fence
            if inside_fence:
                raise ValueError
        usage = result.usage
        def count(name):
            value = getattr(usage, name, None)
            return value if type(value) is int and 0 <= value <= 2147483647 else None
        return Completion(text, count("prompt_tokens"), count("completion_tokens"))
    except (AttributeError, IndexError, TypeError, ValueError, KeyError):
        raise ProviderError("invalid_response") from None


def provider_error_code(exc):
    body = exc.body if isinstance(exc.body, dict) else {}
    error = body.get("error", body)
    return error.get("code") if isinstance(error, dict) else None


def generate(messages, *, allow_solution=False, hint_level=None, model=None):
    selected_model = model or settings.GROQ_MODEL
    gpt_oss = selected_model in {"openai/gpt-oss-120b", "openai/gpt-oss-20b"}
    response_format = {"type": "json_object"}
    if gpt_oss:
        # Constrained decoding avoids JSON-mode validation failures on longer turns.
        response_format = {"type": "json_schema", "json_schema": {
            "name": "mentor_response", "strict": True,
            "schema": {"type": "object", "properties": {
                "response": {"type": "string"},
                "contains_full_solution": {"type": "boolean"},
            }, "required": ["response", "contains_full_solution"], "additionalProperties": False},
        }}
    # GPT-OSS uses include_reasoning, not reasoning_format. Do not send
    # model-specific options to unrelated configurable models.
    reasoning_options = {
        "include_reasoning": False,
        "reasoning_effort": settings.GROQ_REASONING_EFFORT,
    } if gpt_oss else {}
    try:
        with Groq(api_key=settings.GROQ_API_KEY, timeout=settings.GROQ_TIMEOUT_SECONDS, max_retries=0) as client:
            for attempt in range(2):
                try:
                    result = client.chat.completions.create(
                        model=selected_model, messages=messages,
                        temperature=0.3, max_completion_tokens=settings.GROQ_MAX_COMPLETION_TOKENS,
                        response_format=response_format, stream=False,
                        **reasoning_options,
                    )
                    break
                except APIStatusError as exc:
                    # Only a definitive rejected JSON generation can be retried.
                    # Never retry ambiguous network failures or failed safety checks.
                    if attempt == 0 and exc.status_code == 400 and provider_error_code(exc) == "json_validate_failed":
                        continue
                    raise
        return parse_completion(result, allow_solution, hint_level)
    except APITimeoutError:
        raise ProviderError("provider_timeout") from None
    except RateLimitError:
        raise ProviderError("provider_rate_limit") from None
    except APIConnectionError:
        raise ProviderError("provider_unavailable") from None
    except APIStatusError as exc:
        provider_code = provider_error_code(exc)
        # Inspect only fixed categories; never return/log raw provider messages or output.
        if provider_code in ("model_not_found", "model_decommissioned"):
            code = "model_unavailable"
        elif provider_code == "json_validate_failed" or exc.status_code in {400, 422}:
            code = "invalid_response"
        elif exc.status_code == 404:
            code = "model_unavailable"
        else:
            code = "provider_unavailable"
        raise ProviderError(code) from None
    except ProviderError:
        raise
    except Exception:
        # SDK parsing/configuration errors must never expose provider bodies.
        raise ProviderError("invalid_response") from None
