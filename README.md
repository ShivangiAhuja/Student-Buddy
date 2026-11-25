# Student Buddy

An AI coding mentor for LeetCode: a Manifest V3 Chrome extension backed by Django REST Framework, JWT authentication, persistent conversations, and backend-only Groq integration.

**Release status: local MVP / pre-release.** There is currently no public hosted backend or Chrome Web Store installation link. The checked-in extension connects to `http://127.0.0.1:8000`; cloning this repository does not deploy the service. Users currently need a local backend and their own private Groq configuration. The hosted version will let users sign up without supplying provider keys.

- [How to install and use it now](#install-and-use-student-buddy-now)
- [Local demonstration](#run-a-local-demonstration)
- [Backend setup in PowerShell](#run-the-backend-separately-windows-powershell)
- [Public-release work remaining](#public-release-work-remaining)
- [Extension integration details](#extension-integration-phase-6)

## Install and use Student Buddy now

### First-time installation on Windows

Install Git, Python (the backend uses Django 5.2, which requires a supported Python version), and Google Chrome. Node is needed for extension/contract tests; the separate browser-layout script requires Node 22+.

In PowerShell, choose a folder where you keep projects, then run:

```powershell
git clone https://github.com/ShivangiAhuja/Student-Buddy.git
Set-Location .\Student-Buddy\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
    .\.venv\Scripts\python.exe -c "import secrets; from pathlib import Path; p = Path('.env'); p.write_text(p.read_text(encoding='utf-8').replace('replace-with-a-generated-secret-key', secrets.token_urlsafe(64)).replace('replace-with-a-generated-jwt-signing-key', secrets.token_urlsafe(64)), encoding='utf-8')"
}
```

Privately edit **`backend/.env`**, not `.env.example`: set your real `GROQ_API_KEY`. `GROQ_MODEL` is configurable; the default is `openai/gpt-oss-120b`, while `openai/gpt-oss-20b` is the tested local workaround for intermittent 120B JSON failures. Account availability can vary. Keep `GROQ_REASONING_EFFORT=medium` and `GROQ_MAX_COMPLETION_TOKENS=4096` initially. Keep `DJANGO_DEBUG=true` only for local development. No secret is needed in any extension file. Do not share your `.env` or commit it.

From the same `backend` directory:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Leave the server running. Open `http://127.0.0.1:8000/api/health/`; expect `{"status":"ok","service":"student-buddy-backend"}`. The root `/` is not a dashboard. Restart Django after `.env` changes. Returning users only need to start the server; do not overwrite existing private settings or regenerate secrets each time.

### Use the extension

1. Open `chrome://extensions/`, enable **Developer mode**, choose **Load unpacked**, and select the cloned project's **`chrome-extension`** folder (the folder containing `manifest.json`). For an existing installation, click **Reload**, then refresh every open LeetCode tab.
2. Open a LeetCode problem such as [Two Sum](https://leetcode.com/problems/two-sum/). The Student Buddy floating panel appears.
3. Click **Login / Register** in the panel. An extension-owned authentication tab opens. Register a username/email/password, then log in. Return to LeetCode; your username should appear without a manual refresh. Registration is for Student Buddy, not your LeetCode credentials.
4. Check the selected programming language. Use **First Hint**, **Stronger Hint**, and **Direct Nudge** for increasing guidance. You can also type your reasoning and choose **Send Thought**.
5. Use the action dropdown for approach feedback, debugging, or explanation. These modes do not request complete solutions.
6. After three successful hint requests, click **Show Complete Solution** and confirm to request full code, explanation and time/space complexity. It asks the model to preserve the supplied class/function signature. Review and test generated code on LeetCode; outputs are not guaranteed correct.
7. Use **Expand/Collapse**, vertical resizing and the chat scrollbar for long answers. **Copy Code** copies a code block. Scrolling up pauses auto-follow; **Jump to latest response** resumes it.
8. Under **Conversation controls**, **Clear panel** clears the visible display, **Reload history** retrieves saved messages, and **New conversation** starts a separate thread without deleting the earlier one. Keep the same account, problem and language to recover the matching history after page refresh.
9. **Log out** ends the local session. Reloading the extension or closing the browser also clears session-only authentication; log in again when needed.

### Troubleshooting

| Symptom | What to do |
| --- | --- |
| Backend unavailable | Start Django and check `/api/health/`. Keep the terminal running. |
| Model unavailable / provider failure | Check the private backend key and model availability; restart after configuration changes. Keys never belong in Chrome. |
| Unusable response or unexpected refusal | Send a new logical action after a backend fix; old saved answers are not regenerated by refresh. Use the explicit solution button for full code. Some provider outputs still fail validation. |
| Request timed out | Keep the same pending retry action/UUID to recover an uncertain result; do not repeatedly click Send and create duplicate billable attempts. |
| Daily limit reached | Quotas are persisted and reset at midnight UTC; restarting Django does not reset them. |
| Changes do not appear | Reload the extension at `chrome://extensions/`, then refresh the LeetCode tab. |

## Public release work remaining

The main learning workflow exists, but this repository is not yet production-ready. Last implementation verification: **87 backend tests and 45 extension tests passed**; mocked tests do not prove AI correctness. Selected live Groq responses and an offline Chrome layout fixture were checked, not a complete production browser release.

| Area | Current source | Needed before public launch |
| --- | --- | --- |
| Public API | Loopback URL only | Deploy Django behind HTTPS and verify the production health/auth/mentor endpoints. |
| Server/database | Django development server and SQLite; PostgreSQL settings path exists | Add a production WSGI server and PostgreSQL driver, provision PostgreSQL, run migrations and test concurrency/backups/restores. No deployment manifest or production server dependency exists yet. |
| Production security | Environment secrets and JWT ownership checks exist | Set `DJANGO_DEBUG=false`, exact hosts, trusted proxy settings and HTTPS redirect/secure-cookie/HSTS policy appropriate to the host; run `manage.py check --deploy` against real production settings. |
| Abuse and spending | Persisted per-account daily quotas; per-process cache throttles | Shared throttling cache, appropriate proxy/client-IP handling, global provider spending limits, signup-abuse controls and monitoring. Per-account quotas alone do not bound costs from many accounts. |
| AI reliability | Structured output and one bounded JSON-failure retry | Evaluate hints, solutions/signatures and failures across representative problems/languages; align the 28-second extension timeout with up to two 25-second provider calls, server deadlines and request leases. |
| Extension release | Unpacked local development build | Configure the exact hosted HTTPS origin in `config.js`, manifest host permissions and CSP together; verify in a clean Chrome profile and package a reviewed release. No wildcard permission/CORS shortcut is required. |
| User support/data | Registration/login/history exist; account recovery/deletion flows absent | Provide an accurate privacy policy, support contact and clear retention/deletion procedure; plan password reset and practical account support before a broad release. |
| Store distribution | No published listing | Prepare screenshots, permission/data-use disclosures, privacy-policy URL, store account and review submission. |

A local `manage.py check --deploy` currently reports five warnings (debug, HTTPS redirect, HSTS, and two secure-cookie settings). These reflect the local configuration; production must be configured and checked separately. Do not publish `runserver` or an ephemeral SQLite file as the production service.

### Selected deployment: Render + Render PostgreSQL

Render with managed Render PostgreSQL is the selected first-hosting setup. Deployment configuration and provisioning are still pending; this section is a release plan, not evidence of a deployed service.

1. Prepare production dependencies/settings and a repeatable deployment configuration, while keeping local development working.
2. Provision a Django web service and managed PostgreSQL. **Render + Render PostgreSQL** is the selected setup and keeps the first release on one platform; see [Render's Django deployment guide](https://render.com/docs/deploy-django). Render + Neon or Railway are alternatives, not extra requirements. Review current costs and limits before provisioning; no paid resource has been created by this repository update.
3. Configure independent production Django/JWT secrets, Groq credentials/model, database settings, exact hostnames, quotas, proxy trust and HTTPS privately in the host dashboard. Do not copy development secrets into a public file.
4. Run migrations, configure the production process, shared cache, backups and health checks, then test authentication, ownership, AI failure recovery and spend controls against HTTPS. A database alone does not migrate existing SQLite data automatically.
5. Build the extension for that exact HTTPS API origin, then test registration, all hint levels, explicit solutions, history recovery and logout from another computer/profile. End users of the hosted build should not run Django or supply Groq credentials.
6. Start with a small controlled beta. Resolve production failures before publishing broadly.
7. Publish through the Chrome Web Store after preparing accurate disclosures. Chrome requires an accessible privacy policy for extensions handling user data; see [the official privacy-policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy). Explain that problem text, submitted thoughts/code and bounded conversation context are sent to the backend and Groq, and describe storage, retention and deletion accurately.
8. Add the real store link and hosted service/support details to this README only after they are available. Until then, the local installation steps above are the supported path.


## Run a local demonstration

This version runs on your computer: Django must stay running while Chrome uses the extension. Sharing the GitHub repository does not host the API.

1. In VS Code, open the project folder and a PowerShell terminal. Start the backend:

   ```powershell
   Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy\backend'
   .\.venv\Scripts\python.exe manage.py migrate
   .\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
   ```

   Keep this terminal running. Visit `http://127.0.0.1:8000/api/health/`; expect `status: ok`. The root `/` is not a dashboard and may return 404.

2. Put real secrets only in ignored `backend/.env`, never `.env.example`. Set a valid `GROQ_API_KEY` and an available `GROQ_MODEL` (see the model notes above). Restart Django after environment changes. The first-time dependency and virtual-environment setup is documented below.
3. In Chrome open `chrome://extensions/`, enable **Developer mode**, choose **Load unpacked**, and select this project's `chrome-extension` folder. If already installed, click **Reload** and refresh all LeetCode tabs.
4. Open `https://leetcode.com/problems/two-sum/`. In the floating panel choose **Login / Register**. Register a disposable demo account, then log in through the extension-owned tab. Return to LeetCode; confirm the username appears. Reloading the extension clears session sign-in.
5. Select Python. Try **First Hint**, submit `I think a hashmap can store numbers and their indices`, then try **Stronger Hint** and **Direct Nudge**. After three successful hints, explicitly choose **Show Complete Solution**.
6. Use **Expand** to read the solution, scroll through explanation and complexity, and use **Copy Code**. Refresh LeetCode to demonstrate persisted history. Under **Conversation controls**, **Clear panel** clears only the display; **Reload history** restores it; **New conversation** starts a separate thread.
7. Show the architecture: Chrome panel -> trusted extension worker -> JWT-protected Django API -> bounded saved context -> Groq -> saved user/assistant messages. Provider keys stay on Django; the extension never calls Groq directly.

For someone watching remotely, screen-share this local demonstration. Someone running their own copy needs Python, Node for tests, their own private environment configuration/Groq credential, migrations, and the unpacked extension. Public hosting and Chrome Web Store publishing are future steps; this local URL is not accessible on someone else's computer.

Verification from the project root:

```powershell
node --test tests/extension.test.cjs tests/extension-integration.test.cjs
Set-Location .\backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test
```


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

The floating panel now includes **Login / Register**, username display, and **Log out**. Login opens the extension-owned `auth.html` tab and reuses the popup's authentication code; no password field is embedded in LeetCode. Successful login updates open panels automatically. The toolbar popup remains available as an alternative.

The panel opens at up to 500px wide and 92% viewport height (capped at 860px). **Expand** uses up to 960px and most of the viewport; **Collapse** restores the earlier size. Drag the bottom-right resize handle to adjust height. Chat is the only main vertical scrolling region; code blocks scroll horizontally. New responses follow automatically until you scroll up, when **Jump to latest response** becomes available. The language selector now has one clear label instead of a duplicate badge. See [panel usability notes and manual checks](docs/panel-auth-reading.md). The panel and content now allocate height using explicit grid rows; desktop resizing stops at 620px to preserve reading space, and secondary history actions live under **Conversation controls**. Real Chrome fixture measurements and the browser regression command (`node tests/browser-layout.cjs`, Node 22+) are documented in those notes.

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


### Contextual JSON-generation failures

The provider uses strict `json_schema` output for GPT-OSS 120B/20B, retaining the existing response/contains_full_solution contract and all local validation. Other models retain JSON object mode. See [Groq structured outputs](https://console.groq.com/docs/structured-outputs).

A Groq HTTP 400 `json_validate_failed` is a formatting failure, not an unavailable model. Only explicit model errors (or 404) map to model_unavailable. Raw provider bodies, generated failures, prompts and secrets are never sent to clients or logged. Even strict output can be rejected upstream in live requests: the backend retries a definitive HTTP 400 JSON-generation rejection **once**, with the same prompt/options, within the same logical usage reservation. SDK retries remain disabled. There is no automatic retry for timeouts, network errors, rate limits, credentials, unavailable models, or rejected local safety checks. One logical request can therefore incur up to two provider calls and additional latency/token cost; bounded by two SDK timeouts rather than one. A client timeout still requires retrying the same UUID to recover the result safely. No partial output is persisted.

Defaults and `.env.example` now use `GROQ_REASONING_EFFORT=medium` and `GROQ_MAX_COMPLETION_TOKENS=4096`. Update an existing ignored `.env` and restart Django for these values to take effect. A failed UUID replays its saved failure: send a new logical question to try again after configuration fixes. Approach feedback does not authorize a full solution; use the explicit complete-solution control.


Explicit solution mode (hint level 4 or chat action `solution`) now has separate trusted instructions: full executable code, supplied LeetCode signature preservation, explanation, and time/space complexity. Historical hint restrictions and assistant refusals do not override this current permission. GPT-OSS solution output requires `contains_full_solution=true`; a refusal/outline without a nonempty fenced code block is rejected instead of being saved as a successful solution. Earlier hints retain their no-full-solution checks. This validates response structure, not algorithm correctness or exact signature compatibility; generated code still needs review and LeetCode testing. A fresh solution action is needed to replace an old cached refusal; reload alone restores the saved answer.
