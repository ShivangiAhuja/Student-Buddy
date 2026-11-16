# Student Buddy

Student Buddy is an existing Manifest V3 Chrome extension that provides AI coding guidance on LeetCode. It is being upgraded incrementally into a full-stack coding mentor.

## Current status

Phase 3: the standalone backend provides registration, JWT login and refresh, the signed-in user profile, and authenticated refresh-token logout. Health, SQLite, and the extension remain intact. Backend Groq integration, persistent conversations, quotas, and the dashboard remain planned.

The legacy extension still calls Groq directly and saves a user-supplied API key in Chrome sync storage. This is a development prototype, not the intended production security model. The backend migration will remove frontend key storage and direct Groq requests.

## Project layout

```text
Student Buddy/
+-- chrome-extension/      # Existing Chrome extension; runs independently
|   +-- manifest.json      # Chrome configuration and permissions
|   +-- background.js      # Legacy Groq requests
|   +-- content.js         # Floating panel and LeetCode extraction
|   +-- popup.html
|   +-- popup.js
|   +-- styles.css
|   +-- icons/
+-- backend/
|   +-- config/            # Settings and application entry points
|   +-- core/              # Health endpoint and tests
|   +-- accounts/          # Registration, JWT APIs, email index, and tests
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
- In-memory conversation messages; these are not persistent and are currently ignored by the AI prompt builder.
- Ctrl+Shift+M (or Cmd+Shift+M) toggles the panel; Enter sends a thought.

Analytics, saved solution history, related-problem recommendations, general code review, and the other shortcuts advertised in the previous README are not implemented. No measured learning-outcome statistics are available. No LICENSE file is currently present.

## Load the extension locally

1. Open `chrome://extensions/` in Chrome and enable Developer mode.
2. Click **Load unpacked** and select this project's **chrome-extension** folder.
3. If the old root-folder installation is present, record its extension ID and remove it before loading the new folder. Chrome may assign a different ID, so existing settings may not carry over.
4. Open a LeetCode problem page and refresh it. Expand the Student Buddy panel.
5. The legacy AI flow requires a personal Groq key entered through the extension popup. Never put a key in source files, screenshots, or commits. Backend-only credentials will replace this flow in a later phase.

No build step or package installation is needed for the existing extension.

## Manual checks after the move

- Check Chrome's extension error list and service worker console.
- Verify icons, popup, key save status, panel toggle, dragging, and language dropdown.
- Open a problem directly and confirm the displayed title.
- With a personal development key, try each hint level and Send Thought.
- After three hint clicks, request a solution; check code copying and both correction actions.
- Try Clear Conversation History. Messages, in-memory history, draft input, and solution state should reset. Late responses to cleared requests should not reappear.
- Refresh the page and confirm that conversation messages disappear (persistence is not implemented).

These browser and live API checks have not been performed by Codex. Static checks cannot establish compatibility with the current LeetCode DOM or Groq service.

## Phase 1 verification

From PowerShell in `C:\Users\Shivangi Ahuja\Desktop\Student Buddy`:

```powershell
node --test tests/extension.test.cjs
node --check chrome-extension/content.js
node --check chrome-extension/background.js
node --check chrome-extension/popup.js
```

Tests use Node's built-in runner and mock DOM, Chrome, and network APIs; no packages or API key are required. They do not run Chrome. See [Phase 1 notes and manual checks](docs/phase-1-security.md).

## Run the backend separately (Windows PowerShell)

The extension does not use this backend yet. You can run either independently.

Use these commands from a PowerShell terminal. The virtual environment and local `.env` have already been created in this workspace; the first two commands are also useful for a fresh checkout.

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy\backend'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The virtual environment isolates backend packages. Calling its Python directly avoids PowerShell activation-policy issues. `requirements.txt` pins Django 5.2.19, DRF 3.18.3, python-dotenv 1.2.4, and Simple JWT 5.5.1, the versions installed and tested here.

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

`check` validates configuration. `migrate` creates Django's built-in tables, the email index, and JWT blacklist tables in ignored `backend/db.sqlite3`; no conversation models are created. `test` runs account and health API tests in an isolated temporary test database. `runserver` serves the local API; stop it with **Ctrl+C**. This server is for local development, not deployment.

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

Direct dependencies are Django, DRF, python-dotenv, and Simple JWT. There is no Groq, PostgreSQL driver, CORS middleware, or extension integration. Protected APIs require JWT authentication; health, registration, login, and refresh explicitly allow anonymous access.

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

### PostgreSQL later

SQLite requires no separate server. Settings already accept `DB_ENGINE=postgresql` and `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_SSLMODE`. When PostgreSQL is introduced, install and pin its `psycopg` driver, configure a real database, and run migrations against it. SSL defaults to `require` for that future connection. Existing SQLite data will not transfer automatically.

### Next development stage

Next design problem, conversation, and message models with user ownership and API isolation tests. Add backend-only Groq integration after that foundation is tested. The target flow remains extension -> HTTPS + JWT -> Django -> PostgreSQL/Groq. Deployment requires a separate review of HTTPS, hosting, secrets, and production settings; this local foundation is not a deployed service.

## Local backup and secrets

A pre-move copy of the extension, README, and ignore file is stored in `.local-backups/`, which Git ignores. Git also preserves the committed pre-move source. No commit or push was made during Phase 0.

`.env` and `.env.*` are ignored; `.env.example` is allowed. Future environment examples must contain placeholders only. Virtual environments, Python bytecode, and local SQLite databases are ignored.
