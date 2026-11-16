# Student Buddy

Student Buddy is an existing Manifest V3 Chrome extension that provides AI coding guidance on LeetCode. It is being upgraded incrementally into a full-stack coding mentor.

## Current status

Phase 2: a minimal Django REST Framework backend now runs independently of the Chrome extension. It provides `GET /api/health/`, environment-based settings, SQLite, and automated tests. The extension is unchanged. JWT authentication, Groq integration, persistent conversations, quotas, and a dashboard remain planned.

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

The virtual environment isolates backend packages. Calling its Python directly avoids PowerShell activation-policy issues. `requirements.txt` pins Django 5.2.19, DRF 3.18.3, and python-dotenv 1.2.4, the versions installed and tested here.

For a **fresh checkout only**, create local settings without overwriting an existing `.env`:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
    .\.venv\Scripts\python.exe -c "import secrets; from pathlib import Path; p = Path('.env'); p.write_text(p.read_text(encoding='utf-8').replace('replace-with-a-generated-secret-key', secrets.token_urlsafe(64)), encoding='utf-8')"
}
```

This writes a fresh key to the ignored `.env` without printing it. If `.env` already exists, preserve it and ensure it has a real `DJANGO_SECRET_KEY`. The checked-in example deliberately cannot be used as a real key. Local development uses `DJANGO_DEBUG=true`; process environment variables override `.env` values. Never enable debug mode on a public deployment.

Run the backend commands from the same `backend` directory:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

`check` validates configuration. `migrate` creates Django's built-in tables in ignored `backend/db.sqlite3`; it does not create Student Buddy conversation models or authentication endpoints. `test` runs the health API tests. `runserver` serves the local API; stop it with **Ctrl+C**. This server is for local development, not deployment.

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

Only Django, DRF, and python-dotenv are direct dependencies. There is no JWT, Groq, PostgreSQL driver, CORS middleware, or extension integration in this phase. DRF defaults to requiring authenticated access for future views; health explicitly allows anonymous access. Django's standard authentication middleware is present, but no login or registration API exists.

### PostgreSQL later

SQLite requires no separate server. Settings already accept `DB_ENGINE=postgresql` and `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_SSLMODE`. When PostgreSQL is introduced, install and pin its `psycopg` driver, configure a real database, and run migrations against it. SSL defaults to `require` for that future connection. Existing SQLite data will not transfer automatically.

### Next development stage

Design the user and data-ownership model before building conversation features. Then add registration and JWT endpoints with authentication tests, followed by problem/conversation models and backend-only Groq integration. The target flow remains extension -> HTTPS + JWT -> Django -> PostgreSQL/Groq. Deployment requires a separate review of HTTPS, hosting, secrets, and production settings; this local foundation is not a deployed service.

## Local backup and secrets

A pre-move copy of the extension, README, and ignore file is stored in `.local-backups/`, which Git ignores. Git also preserves the committed pre-move source. No commit or push was made during Phase 0.

`.env` and `.env.*` are ignored; `.env.example` is allowed. Future environment examples must contain placeholders only. Virtual environments, Python bytecode, and local SQLite databases are ignored.
