# Student Buddy

Student Buddy is an existing Manifest V3 Chrome extension that provides AI coding guidance on LeetCode. It is being upgraded incrementally into a full-stack coding mentor.

## Current status

Phase 6: the existing Chrome extension now uses Django for registration, JWT authentication, context-aware mentor requests, and persistent conversation recovery. Groq credentials stay exclusively on the backend. The floating panel and hint/solution/correction actions are preserved. Automated tests mock Groq; browser and live-Groq verification remain manual.

The extension sends authenticated requests only to the configured Django backend. Its old Groq key input and direct provider calls are removed. Startup removes the legacy `apiKey` entry from sync, local, and session storage without reading or transmitting it.

## Project layout

```text
Student Buddy/
+-- chrome-extension/      # Existing Chrome extension; runs independently
|   +-- manifest.json      # Chrome configuration and permissions
|   +-- background.js      # Trusted messaging and authenticated backend calls
|   +-- api-client.js      # JWT lifecycle and reusable HTTP client
|   +-- mentor-client.js   # Conversation mappings and idempotent retries
|   +-- config.js          # Public backend-origin build configuration
|   +-- content.js         # Floating panel and LeetCode extraction
|   +-- popup.html
|   +-- popup.js
|   +-- styles.css
|   +-- icons/
+-- backend/
|   +-- config/            # Settings and application entry points
|   +-- core/              # Health endpoint and tests
|   +-- accounts/          # Registration, JWT APIs, email index, and tests
|   +-- problems/          # Canonical problem metadata and APIs
|   +-- conversations/     # Owned conversations and private message services
|   +-- ai_engine/         # Mentor prompts, Groq client, orchestration, and usage
|   +-- manage.py
|   +-- requirements.txt
|   +-- .env.example       # Placeholders only
+-- docs/                  # Audit and security notes
+-- tests/                 # Extension tests
+-- .gitignore
+-- README.md
```

## Implemented in the source

- Floating, draggable mentor panel with minimize/expand control.
- Problem title and description extraction using DOM selector fallbacks.
- Automatic language detection and a dropdown with 14 language choices.
- Three hint levels and submission of a student's thoughts.
- Complete solution button unlocked after three successful hint requests.
- Solution and correction prompts requesting explanations and complexity.
- Correction requests with optional student-provided error details.
- Code block formatting and copy buttons.
- Backend-persisted conversations and chronological context; the panel restores recent messages on refresh.
- Popup registration/login/logout with browser-session JWT storage restricted to trusted extension contexts.
- Ctrl+Shift+M (or Cmd+Shift+M) toggles the panel; Enter sends a thought.

Analytics, saved solution history, related-problem recommendations, general code review, and the other shortcuts advertised in the previous README are not implemented. No measured learning-outcome statistics are available. No LICENSE file is currently present.

## Load the extension locally

1. Open `chrome://extensions/` in Chrome and enable Developer mode.
2. Click **Load unpacked** and select this project's **chrome-extension** folder.
3. If the old root-folder installation is present, record its extension ID and remove it before loading the new folder. Chrome may assign a different ID, so existing settings may not carry over.
4. Start Django using the backend instructions below. Use Chrome 114 or newer.
5. Open the popup, register if needed, and log in. Open a LeetCode problem page and refresh it. Expand the Student Buddy panel.
6. Real AI requests require a Groq key configured only in `backend/.env`. The extension never asks for that key. See the [Phase 6 manual checklist](docs/phase-6-extension-integration.md).

No build step or package installation is needed for the existing extension.

## Manual checks after the move

- Check Chrome's extension error list and service worker console.
- Verify icons, popup registration/login/logout, panel toggle, dragging, and language dropdown.
- Open a problem directly and confirm the displayed title.
- With Groq configured on the backend, try each hint level and Send Thought.
- After three hint clicks, request a solution; check code copying and both correction actions.
- Try Clear visible panel. Messages, draft input, and UI progress reset, while server history is kept. Late responses must not reappear. New conversation and Delete saved conversation are separate explicit actions.
- Refresh the page and confirm recent saved messages return for the same signed-in user, problem, and language.

These browser and live API checks have not been performed by Codex. Static checks cannot establish compatibility with the current LeetCode DOM or Groq service.

## Phase 1 verification

From PowerShell in `C:\Users\Shivangi Ahuja\Desktop\Student Buddy`:

```powershell
node --test tests/extension.test.cjs tests/extension-integration.test.cjs
node --check chrome-extension/content.js
node --check chrome-extension/background.js
node --check chrome-extension/popup.js
```

Tests use Node's built-in runner and mock DOM, Chrome, and network APIs; no packages or API key are required. They do not run Chrome. See [Phase 1 notes and manual checks](docs/phase-1-security.md).

## Run the backend separately (Windows PowerShell)

Start the backend before using popup authentication or mentor actions. The floating panel can still render while the backend is offline and displays a connection error when a request cannot complete.

Use these commands from a PowerShell terminal. The virtual environment and local `.env` have already been created in this workspace; the first two commands are also useful for a fresh checkout.

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy\backend'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The virtual environment isolates backend packages. Calling its Python directly avoids PowerShell activation-policy issues. Direct dependencies are pinned: Django 5.2.19, DRF 3.18.3, python-dotenv 1.2.4, Simple JWT 5.5.1, and the official Groq SDK 1.7.0.

For a **fresh checkout only**, create local settings without overwriting an existing `.env`:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
    .\.venv\Scripts\python.exe -c "import secrets; from pathlib import Path; p = Path('.env'); p.write_text(p.read_text(encoding='utf-8').replace('replace-with-a-generated-secret-key', secrets.token_urlsafe(64)).replace('replace-with-a-generated-jwt-signing-key', secrets.token_urlsafe(64)), encoding='utf-8')"
}
```

This writes independent Django and JWT keys to the ignored `.env` without printing them. If `.env` already exists, preserve it and follow the Phase 3 upgrade instructions below. The example placeholders cannot be used as real keys. Local development uses `DJANGO_DEBUG=true`; process environment variables override `.env`. Never enable debug mode publicly.

Run the backend commands from the same `backend` directory:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

`check` validates configuration. `migrate` creates Django's built-in tables, the email index, JWT blacklist tables, and problem/conversation/message tables in ignored `backend/db.sqlite3`. `test` runs all backend tests in an isolated temporary test database. `runserver` serves the local API; stop it with **Ctrl+C**. This server is for local development, not deployment.

In a second PowerShell terminal, from any directory:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health/' -Method Get
```

Expected JSON (also viewable by opening that URL):

```json
{"status": "ok", "service": "student-buddy-backend"}
```

`/api/health/` is a public liveness check. It confirms the application can answer requests; it does not verify database readiness or any AI provider. The root `/` has no route and returns 404.

### Backend structure and settings

- `manage.py` runs Django management commands.
- `config/settings.py` loads environment values, installed apps, middleware, and database settings. A missing or placeholder secret fails startup. Debug defaults off, allowed hosts default to loopback, and no CORS or proxy trust is enabled.
- `config/urls.py` maps `/api/` to `core/urls.py`, which maps `health/` to the DRF view in `core/views.py`.
- `core/tests.py` checks exact JSON, rejected write methods, and host validation. The tests deliberately prohibit database queries.
- `config/wsgi.py` and `config/asgi.py` are standard entry points for later hosting; no hosting server dependency is installed yet.

Direct dependencies are Django, DRF, python-dotenv, Simple JWT, and Groq. There is no PostgreSQL driver or CORS middleware. The extension worker uses narrow host permissions for cross-origin backend requests. Protected APIs require JWT authentication; health, registration, login, and refresh explicitly allow anonymous access. Missing Groq credentials disable only AI calls, not the existing APIs.

## Authentication API (Phase 3)

Django's standard `User` model already supplies the fields, authentication, and password hashing needed here. A custom model is unnecessary. Usernames follow Django's case-sensitive uniqueness rules. Registration lowercases emails; an accounts migration adds a case-insensitive unique index for nonempty emails to prevent duplicate registrations, including concurrent inserts. Existing duplicate emails must be resolved before migration; no users are silently deleted. Empty emails remain available for management commands, but API registration requires an email.

### Upgrade an existing environment

Run from PowerShell. This preserves `.env` and appends an independent random JWT signing key only if it is missing. This workspace's local key has already been generated.

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy\backend'
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
@'
from pathlib import Path
import secrets
p = Path('.env')
text = p.read_text(encoding='utf-8')
if not any(line.startswith('JWT_SIGNING_KEY=') for line in text.splitlines()):
    with p.open('a', encoding='utf-8') as env_file:
        env_file.write('\nJWT_SIGNING_KEY=' + secrets.token_urlsafe(64) + '\n')
'@ | .\.venv\Scripts\python.exe -
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test --verbosity 2
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

If a key already exists as a placeholder, replace it locally with a generated value. Restart the server after changing settings. Keep keys out of tracked files.

### Environment variables

`.env.example` is the complete reference. Process environment overrides `.env`.

| Variable | Default / requirement |
| --- | --- |
| `DJANGO_SECRET_KEY` | Required random backend-only secret |
| `JWT_SIGNING_KEY` | Required independent random secret, at least 32 characters |
| `DJANGO_DEBUG` | `false`; example enables local debugging |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` |
| `DB_ENGINE`, `DB_NAME` | `sqlite`, `db.sqlite3` |
| `JWT_ACCESS_MINUTES` | `5`, positive integer |
| `JWT_REFRESH_DAYS` | `1`, positive integer |
| `AUTH_REGISTER_RATE` | `5/hour` per IP |
| `AUTH_LOGIN_RATE` | `10/minute` per IP |
| `AUTH_REFRESH_RATE` | `30/minute` per IP |
| `AUTH_LOGOUT_RATE` | `30/minute` per IP |

JWT payloads are signed, not encrypted. Tokens include a user identifier, not passwords or emails. Never log passwords, signing keys, or tokens.

### Endpoints

| Method and URL | Access | Request / response |
| --- | --- | --- |
| `GET /api/health/` | Public | `200`: status and service |
| `POST /api/auth/register/` | Public, throttled | username, email, password, password_confirmation; `201`: id, username, email |
| `POST /api/auth/login/` | Public, throttled | username, password; `200`: access, refresh |
| `POST /api/auth/refresh/` | Public, throttled | refresh; `200`: new access and refresh |
| `GET /api/auth/profile/` | Bearer access token | `200`: own id, username, email |
| `POST /api/auth/logout/` | Bearer access token, throttled | own refresh; `204`, empty body |

Validation failures and duplicates return `400`. Missing/invalid authentication and invalid refresh requests return `401`; throttled requests return `429` with `Retry-After`. Login returns the same generic credential error for unknown users, wrong passwords, and inactive users. Logout rejects malformed, expired, already-blacklisted, or another user's refresh token with `400`. Profile takes no user-ID argument.

### Example PowerShell requests

In a second terminal, from any directory while the server runs. Choose a fresh username/email when repeating registration. The secure password prompt avoids a literal password in shell history, but the password necessarily exists in memory while constructing JSON. Tokens remain in variables rather than being printed.

```powershell
$apiBase = 'http://127.0.0.1:8000/api'
$studentName = 'student_demo'
$studentEmail = 'student_demo@example.com'
$studentCredential = Get-Credential -UserName $studentName -Message 'Choose a strong Student Buddy password'
$studentPassword = $studentCredential.GetNetworkCredential().Password

$registrationBody = @{
    username = $studentName
    email = $studentEmail
    password = $studentPassword
    password_confirmation = $studentPassword
} | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/auth/register/" -Method Post -ContentType 'application/json' -Body $registrationBody

$loginBody = @{ username = $studentName; password = $studentPassword } | ConvertTo-Json
$studentTokens = Invoke-RestMethod -Uri "$apiBase/auth/login/" -Method Post -ContentType 'application/json' -Body $loginBody
$studentHeaders = @{ Authorization = "Bearer $($studentTokens.access)" }
Invoke-RestMethod -Uri "$apiBase/auth/profile/" -Method Get -Headers $studentHeaders

# Refresh rotates BOTH tokens. Always replace the previous pair.
$refreshBody = @{ refresh = $studentTokens.refresh } | ConvertTo-Json
$studentTokens = Invoke-RestMethod -Uri "$apiBase/auth/refresh/" -Method Post -ContentType 'application/json' -Body $refreshBody
$studentHeaders = @{ Authorization = "Bearer $($studentTokens.access)" }

$logoutBody = @{ refresh = $studentTokens.refresh } | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/auth/logout/" -Method Post -Headers $studentHeaders -ContentType 'application/json' -Body $logoutBody
# This final request should fail with HTTP 401:
Invoke-RestMethod -Uri "$apiBase/auth/refresh/" -Method Post -ContentType 'application/json' -Body $logoutBody

Remove-Variable studentPassword, studentCredential, registrationBody, loginBody, refreshBody, logoutBody, studentTokens, studentHeaders
```

PowerShell reports the expected final `401` as an HTTP error. Logout revokes only the submitted refresh token. Already-issued access tokens remain valid until expiry, and other sessions are unaffected. Refresh rotation blacklists the consumed refresh token; clients must replace their stored pair. This does not implement token-family compromise detection or atomic replay prevention for concurrent refreshes.

### Security and maintenance

DRF uses JWT only for protected APIs; Django session cookies do not grant API access. Password validation includes the candidate username/email, and `create_user` hashes passwords. Auth responses use `Cache-Control: no-store`. No password/token logging is added. Production debug mode must be off, and logging must exclude request bodies and Authorization headers.

Throttling uses Django's default local-memory cache: limits are per process and reset on restart. Before deployment, configure shared caching and infrastructure-level rate limits. This is basic abuse control, not distributed brute-force or denial-of-service protection. Untrusted forwarded-IP headers are ignored (`NUM_PROXIES=0`); trusted-proxy handling needs a deployment-specific design. Users sharing an IP share limits. Health is not throttled. See [DRF's throttling limitations](https://www.django-rest-framework.org/api-guide/throttling/).

Blacklist records persist in the database. When deployment is introduced, schedule this command daily from `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py flushexpiredtokens
```

Email verification, password reset, MFA, per-account throttling, immediate access-token revocation, and logout-all-devices are not implemented. Registration duplicate errors intentionally disclose username/email availability. CORS remains disabled. Production requires HTTPS and a separate deployment review. See [Simple JWT rotation and blacklist settings](https://django-rest-framework-simplejwt.readthedocs.io/en/stable/settings.html).

## Problems and conversations (Phase 4)

All new endpoints require `Authorization: Bearer <access-token>`. Problems are shared metadata; conversations and messages are private to their owner. Full schema, service design, limits, examples, and future integration details are in [Phase 4 documentation](docs/phase-4-conversations.md).

| Method and URL | Behavior |
| --- | --- |
| `POST /api/problems/` | Submit `title`, `url`, `statement`; `201` for a new problem or `200` for an existing canonical URL |
| `GET /api/problems/{id}/` | Retrieve shared problem metadata |
| `POST /api/conversations/` | Submit `problem_id` and `language`; returns `201`, owned by the signed-in user |
| `GET /api/conversations/` | List only your conversations, 20 per page |
| `GET /api/conversations/{id}/` | Conversation plus up to 50 latest messages in sequence order; includes `messages_truncated` |
| `DELETE /api/conversations/{id}/` | Delete your conversation and its messages; returns `204` |
| `GET /api/conversations/{id}/messages/` | All messages through 20-item pages in ascending sequence order |

Problem URLs normalize to `https://leetcode.com/problems/<slug>/`. Supported HTTP/HTTPS, www, case, page-tab, query, and fragment variants reuse the same record. Other hosts, credentials, unexpected ports, invalid slugs, and unsupported paths return `400`. No URL is fetched, and existence on LeetCode is not verified. Submitting an existing problem does not overwrite its title or statement. Do not include personal information in shared metadata.

Conversation detail/messages/delete return `404` for another user's ID. Unknown creation fields, including `owner`, `messages`, or `role`, return `400`. There is no public message-writing endpoint; assistant messages can only originate from trusted backend services. Both roles can be persisted through `conversations.services.append_message`, and `get_history` returns bounded chronological context for future AI calls. No AI calls happen yet.

Creation APIs accept JSON only, with a default 65,536-byte body limit (`413` if exceeded). Field limits: 255-character title, 30,000-character statement, 8,000-character private message. New request scopes default to 60 problem requests/minute and 120 conversation requests/minute per user, shared across their reads and writes. These use the existing local-memory throttling infrastructure.

New optional `.env` settings (defaults work without editing your current `.env`):

```dotenv
PROBLEM_REQUEST_RATE=60/minute
CONVERSATION_REQUEST_RATE=120/minute
API_MAX_BODY_BYTES=65536
HISTORY_MAX_MESSAGES=20
HISTORY_MAX_CHARACTERS=24000
```

Run from PowerShell:

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy\backend'
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test --verbosity 2
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

In another terminal, log in using the earlier examples, then use the current `$studentHeaders` before logging out:

```powershell
$problemBody = @{
    title = 'Two Sum'
    url = 'https://leetcode.com/problems/two-sum/description/?source=practice'
    statement = 'Given an array of integers and a target, return indices of two numbers whose sum is the target.'
} | ConvertTo-Json
$problemRecord = Invoke-RestMethod -Uri "$apiBase/problems/" -Method Post -Headers $studentHeaders -ContentType 'application/json' -Body $problemBody
$conversationBody = @{ problem_id = $problemRecord.id; language = 'Python' } | ConvertTo-Json
$conversationRecord = Invoke-RestMethod -Uri "$apiBase/conversations/" -Method Post -Headers $studentHeaders -ContentType 'application/json' -Body $conversationBody
Invoke-RestMethod -Uri "$apiBase/conversations/" -Headers $studentHeaders
Invoke-RestMethod -Uri "$apiBase/conversations/$($conversationRecord.id)/" -Headers $studentHeaders
Invoke-RestMethod -Uri "$apiBase/conversations/$($conversationRecord.id)/messages/" -Headers $studentHeaders
# Optional: permanently delete this owned conversation and its messages.
# Invoke-RestMethod -Uri "$apiBase/conversations/$($conversationRecord.id)/" -Method Delete -Headers $studentHeaders
```

New conversations are empty until a successful mentor request or trusted backend service appends messages. The extension now populates this database through authenticated AI requests. PostgreSQL and high-contention multi-worker behavior have not been exercised here; SQLite may return lock errors under contention.

## AI mentor APIs (Phase 5)

Full lifecycle, failure semantics, quotas, model configuration, and examples are in [Phase 5 documentation](docs/phase-5-ai-engine.md).

The official Groq SDK runs on the backend with automatic retries disabled. Groq currently lists `openai/gpt-oss-120b` as a production model; model availability and account access can change, so confirm the [Groq model list](https://console.groq.com/docs/models) when configuring it. Responses must be structured JSON and pass size, completion, and teaching-policy checks before persistence. No generated code is executed.

Add these settings to your ignored `backend/.env`. Enter the real key locally; do not put it in source files, commits, shell commands, screenshots, or frontend JavaScript:

```dotenv
GROQ_API_KEY=replace-with-your-groq-api-key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=low
GROQ_TIMEOUT_SECONDS=25
GROQ_MAX_COMPLETION_TOKENS=2048
AI_REQUEST_RATE=10/minute
AI_DAILY_REQUEST_LIMIT=50
AI_MAX_PROMPT_CHARACTERS=60000
AI_LEASE_SECONDS=120
```

History budgets continue to use `HISTORY_MAX_MESSAGES=20` and `HISTORY_MAX_CHARACTERS=24000`. The 60,000-character total prompt budget includes system instructions, problem data, history, and the current request; history shrinks to fit. Character budgets are not tokenizer counts. The completion token cap and the 8,000-character stored-response limit are separate.

The model is selected from process environment first, then saved `backend/.env`, then the default above. For an old-model availability error, save `GROQ_MODEL=openai/gpt-oss-120b` in `.env` and fully restart Django. In the server's PowerShell terminal, remove a stale override with `Remove-Item Env:GROQ_MODEL -ErrorAction SilentlyContinue` before restarting. Reload the Chrome extension too if an old installation still displays raw provider errors. Current APIs intentionally return sanitized provider errors.

GPT-OSS requests retain JSON object mode and explicitly use `include_reasoning=False` plus `GROQ_REASONING_EFFORT` (`low`, `medium`, or `high`; default `low`). These model-specific parameters are omitted for other models; `reasoning_format` is not sent. Hiding reasoning does not disable it or remove its token cost. If responses run out of completion tokens, they remain rejected rather than partially saved; consider `GROQ_MAX_COMPLETION_TOKENS=4096` after reviewing latency and quota. Access to the replacement still depends on your Groq account. See [Groq's reasoning options](https://console.groq.com/docs/reasoning).

Verify only the non-secret model setting from `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from django.conf import settings; print(settings.GROQ_MODEL)"
```

Expected: `openai/gpt-oss-120b`. Do not dump all Django settings or the contents of `.env`. A previously failed AI request ID replays its stored error even after configuration is fixed; submit a fresh action/UUID to verify the new model. No fallback model or additional provider retry is silently selected.

| Endpoint | Required / optional input |
| --- | --- |
| `POST /api/hints/` | Required `request_id` (UUID), `language`, `hint_level` (1–4); new conversation needs `problem_id` or nested `problem`; optional `conversation_id`, `user_thought`, `code` |
| `POST /api/chat/` | Same identity/context fields; `action`: discuss (default), debug, explain, or solution; thought/question or code required unless explicitly requesting a solution |

Hint levels are conceptual guidance, algorithm/data structure guidance, approach/pseudocode, and complete solution with explanation and time/space complexity. Only level 4 or chat `action=solution` explicitly permits a full solution. Prompt separation and output checks reduce accidental disclosure but cannot prove semantic correctness or resistance to every prompt injection.

For an existing conversation, send its ID and matching language; problem identity may be omitted or must match. For a new conversation, omit/null its ID and supply either `problem_id` or `problem: {title, url, statement}`. Existing shared metadata is reused without overwrite. Fields such as `owner`, `role`, `model`, or `messages` are rejected. New AI endpoints require JWTs and use the bounded JSON parser.

From PowerShell in `backend/`, install, migrate, test, and start:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py test --verbosity 2
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

In the authenticated PowerShell session from the examples above (before logout), using the current `$studentHeaders` and `$problemRecord`:

```powershell
$mentorRequestId = [guid]::NewGuid().ToString()
$hintBody = @{
    request_id = $mentorRequestId
    problem_id = $problemRecord.id
    language = 'Python'
    hint_level = 1
    user_thought = 'I think a hashmap could help. What should I store?'
} | ConvertTo-Json
$mentorReply = Invoke-RestMethod -Uri "$apiBase/hints/" -Method Post -Headers $studentHeaders -ContentType 'application/json' -Body $hintBody
$mentorReply

# New turn: generate a NEW request ID and continue the returned conversation.
$chatBody = @{
    request_id = [guid]::NewGuid().ToString()
    conversation_id = $mentorReply.conversation_id
    language = 'Python'
    action = 'debug'
    user_thought = 'Why does checking the complement after insertion fail for duplicates?'
    code = 'seen[number] = index'
} | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/chat/" -Method Post -Headers $studentHeaders -ContentType 'application/json' -Body $chatBody
```

Success returns `{request_id, conversation_id, response}` plus `hint_level` for hints. Keep the **same request ID and identical body** when retrying a lost response. Completed repeats return the stored response without another provider call or quota charge. Different input with the same ID returns `409`; in-progress repeats also return `409`.

A provider failure saves neither user nor assistant message. A newly created conversation remains empty, and the sanitized error includes its ID when available. Failures consume one persisted daily attempt, as do worker crashes. Repeating that failed ID replays the same error without another charge; an intentional new attempt needs a new ID. Daily quotas reset at midnight UTC, not the computer's local midnight. Database failures return sanitized `503` errors; retry the same ID to avoid duplication. A pending request can remain blocked until its lease expires.

Only short reservation/completion transactions are used; the provider call runs outside them. A per-conversation lease rejects overlapping turns, expires abandoned work, and prevents late workers from committing stale output. Message pairs and request completion commit atomically. The daily counter is in SQLite/PostgreSQL, so restart/cache resets do not reset quotas. Per-minute throttling still uses the default per-process cache; shared cache and infrastructure limits are required before production.

No live Groq call or actual Chrome verification is claimed. A loopback HTTP contract test does exercise the extension worker client against Django with mocked Groq. Untrusted text and conversation history are sent to Groq during real calls; do not submit secrets or private code without understanding provider data handling. Keep SDK/HTTP debug logging off. The Phase 6 extension no longer stores or transmits provider keys; startup removes the old key for the current extension ID.

### PostgreSQL later

SQLite requires no separate server. Settings already accept `DB_ENGINE=postgresql` and `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_SSLMODE`. When PostgreSQL is introduced, install and pin its `psycopg` driver, configure a real database, and run migrations against it. SSL defaults to `require` for that future connection. Existing SQLite data will not transfer automatically.

### Next development stage

Phase 7 should complete the documented browser/live-provider checks, fix any LeetCode selector or model-quality issues, exercise PostgreSQL/shared-cache concurrency, and prepare production configuration, privacy, and Chrome Web Store requirements. Deployment remains a separate authorized step.

## Extension integration (Phase 6)

The popup handles registration/login/logout and displays the current username. The background worker owns JWTs, refresh rotation, HTTP requests, conversation mappings, and retry UUIDs. Content scripts handle only problem extraction and the existing floating UI. Backend APIs and schemas are unchanged. See [Phase 6 architecture, storage decisions, and manual checklist](docs/phase-6-extension-integration.md).

Tokens use `chrome.storage.session` with `TRUSTED_CONTEXTS` access, surviving worker restarts but not browser-session termination or extension reload. No passwords are stored. Only non-secret conversation IDs and generation markers persist locally, keyed by backend origin, user ID, canonical problem URL, and language. Session-only pending request bodies preserve UUIDs across page/worker restarts; logging out discards those pending drafts. Do not use a shared browser profile for sensitive code.

`config.js` selects `http://127.0.0.1:8000`. Manifest host permissions allow only loopback HTTP, and CSP pins connections to port 8000. Production uses a reviewed HTTPS build-time origin: update `config.js`, the manifest's exact host permission, and `connect-src` together, then reload/review the extension. There is no arbitrary-URL setting or page-controlled URL proxy. No wildcard CORS is enabled; worker host permissions handle cross-origin access.

Buttons map First Hint/Stronger Hint/Direct Nudge to levels 1/2/3. After three successful hints, Show Complete Solution explicitly requests level 4 with explanation and complexity. Send Thought uses approach feedback by default; its mode selector also supports debugging and code explanation. Correction buttons explicitly request a corrected complete solution. Clear panel keeps the saved conversation, New conversation detaches it without deleting it, and Delete saved conversation requires confirmation in the popup.

Recovery displays the backend's latest 50 messages in sequence order, with a truncation notice when appropriate. Full history remains available through the existing paginated API. A missing/deleted conversation ID is removed from the mapping without silently creating a paid AI request. Ambiguous AI retries keep their exact UUID/body; a recovered uncertain draft exposes a Retry request button. Changed drafts cannot silently replace uncertain requests.

Automated checks from the project root:

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy'
git status
git diff --check
node --test tests/extension.test.cjs tests/extension-integration.test.cjs
Set-Location .\backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test --verbosity 2
```

The backend suite includes a loopback HTTP test using the real extension worker client and Django API, an isolated test database, and mocked Groq. It requires Node.js 18+ and is explicitly skipped if Node is absent. Node VM tests do not run Chrome or verify its CSP/storage isolation implementation. No real Groq key is needed for automated tests. Detailed manual steps and known MV3 timeout limitations are in the Phase 6 checklist.

## Local backup and secrets

A pre-move copy of the extension, README, and ignore file is stored in `.local-backups/`, which Git ignores. Git also preserves the committed pre-move source. No commit or push was made during Phase 0.

`.env` and `.env.*` are ignored; `.env.example` is allowed. Future environment examples must contain placeholders only. Virtual environments, Python bytecode, and local SQLite databases are ignored.
