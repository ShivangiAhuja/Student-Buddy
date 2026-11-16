# Student Buddy

Student Buddy is an existing Manifest V3 Chrome extension that provides AI coding guidance on LeetCode. It is being upgraded incrementally into a full-stack coding mentor.

## Current status

Phase 1: focused extension security and stability fixes are implemented, with automated regression tests. The existing panel and actions are preserved. `backend/` is currently empty; Django, authentication, persistent storage, quotas, and a dashboard are planned, not implemented.

The legacy extension still calls Groq directly and saves a user-supplied API key in Chrome sync storage. This is a development prototype, not the intended production security model. The backend migration will remove frontend key storage and direct Groq requests.

## Project layout

```text
Student Buddy/
??? chrome-extension/
?   ??? manifest.json     # Chrome permissions, worker, popup, injected files
?   ??? background.js     # Groq requests and mentor/solution/correction prompts
?   ??? content.js        # LeetCode extraction, floating panel, message rendering
?   ??? popup.html        # Settings interface
?   ??? popup.js          # Save legacy key and request history clearing
?   ??? styles.css        # Floating panel appearance
?   ??? icons/            # 16, 48, and 128 pixel icons
??? backend/              # Reserved for Django; currently empty
??? docs/phase-0-audit.md
??? .gitignore
??? README.md
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

## Next development stages

Start with a minimal Django/DRF project and a local health endpoint, then add models, JWT authentication, backend Groq integration, and extension integration in small runnable steps. The target request flow is:

```text
Chrome extension ? HTTPS + JWT ? Django REST Framework
                                  ??? PostgreSQL
                                  ??? Groq (backend environment key)
```

SQLite is acceptable initially. PostgreSQL, deployment, and a dashboard follow later. See [the Phase 0 audit](docs/phase-0-audit.md) for verified limitations and migration priorities.

## Local backup and secrets

A pre-move copy of the extension, README, and ignore file is stored in `.local-backups/`, which Git ignores. Git also preserves the committed pre-move source. No commit or push was made during Phase 0.

`.env` and `.env.*` are ignored; `.env.example` is allowed. Future environment examples must contain placeholders only. Virtual environments, Python bytecode, and local SQLite databases are ignored.
