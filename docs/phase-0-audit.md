# Phase 0 source audit

Inspected on 2026-11-16 before modifying the project.

## Initial repository state

- Branch `main`, clean working tree; local tracking state showed `main...origin/main` with no ahead/behind count. No remote fetch was performed.
- HEAD: `8349aab` (`deleted`). The ZIP was already absent and was not a pending deletion. No ZIP was restored or deleted during this work.
- Extension files were at repository root; `chrome-extension/` did not exist.
- `backend/` existed and was empty. There were no Django files or automated tests.
- No repository AGENTS.md was found.
- Existing ignore rules already used correct `__pycache__/`, `*.pyc`, and `.env.*` patterns, rather than the malformed alternatives in the handover.

## Confirmed code behavior and defects

### background.js

The Manifest V3 service worker handles `getMentorResponse`, `getSolution`, and `correctSolution`. All three handlers read `apiKey` from `chrome.storage.sync` and call Groq directly. There is no backend, authentication, timeout, request quota, or persistent database.

`buildMessages` accepts history but never uses it. Hints include only the current problem and thought, and do not receive the selected language. The separate solution/correction handlers do receive language and editor template. Responses index `choices[0].message.content` without structural validation; only hints explicitly check empty content. HTTP error handling exists, but assumes error bodies are JSON. Console logs include problem/code/response content.

### content.js

The panel, hint buttons, thought submission, solution unlock, correction buttons, and clipboard actions exist. `conversationHistory` is a page-memory array and resets on reload. Solutions and corrections are not added to that array.

Problem extraction stores title and only the first 1,500 characters of the description, omitting the URL. Extraction happens at initialization, with no route-change reset or robust wait for asynchronously loaded problem content. Selectors include broad class matches which can select unrelated elements.

Language monitoring runs every three seconds and can overwrite a manual selection. It updates the badge but not the dropdown. The editor template is gathered inside a two-second timer, so calling `extractCodeTemplate()` immediately before sending a request can send stale or empty code. Monaco visible lines may not represent the entire file.

`formatMessage` escapes fenced code but leaves ordinary text, inline code, bold text, and headers unescaped before insertion through `innerHTML`. Student input, AI output, and errors can therefore become HTML. The problem title is also interpolated into HTML. Static UI templates using `innerHTML` are distinct from these untrusted-content sinks.

Hint clicks increase the unlock counter before request success, and repeated clicks at one level unlock solutions. Requests can overlap. Clear History empties `#sb-chat`, but messages are appended to `#sb-content`, so visible messages remain. It also leaves `lastSolutionCode` and the solution button state unchanged.

### popup.html and popup.js

Settings load/save a user-supplied key in Chrome sync storage. Validation is only a minimum length check. Clear History sends a message to the active LeetCode tab; the receiver does not acknowledge it. The popup displays version 2.0 while the manifest declares 1.0. Marketing and license claims in the popup have not been verified.

### manifest.json and styles.css

The manifest is version 3 and references files through relative paths. Moving the complete extension together requires no internal path edits. Existing permissions are storage, activeTab, and Groq host access; content scripts match LeetCode problem URLs.

The file named `icon48.png` is actually 32 by 32 pixels, despite being declared as 48 pixels. The 16 and 128 pixel icons match their declarations. This existing asset issue is preserved for a separate correction.

CSS provides the existing dark theme and panel styling, including a resize declaration whose browser behavior still needs checking. It imports Google Fonts remotely. No local CSS asset references require migration.

### README.md

The previous README advertised saved history, analytics, related problems, general code review, extra keyboard shortcuts, and quantified learning improvements without source support. It also linked a missing LICENSE file and placeholder repository URLs. The revised README distinguishes implemented functionality from planned work. The original is preserved in the ignored local backup and Git history.

## Secret inspection

No likely literal keys were found by a pattern scan of tracked text files. A history scan across 14 commits found no Groq/OpenAI-style keys or private-key headers in searchable text. No values were printed. These are heuristic checks, not proof of absence: binary archives, arbitrary secret formats, untracked external files, and Chrome profile storage were not covered.

## Changes made

1. Created an ignored local pre-move backup with original files and extension SHA-256 hashes.
2. Moved six extension source files and three icons into `chrome-extension/`; verified every moved file was byte-identical.
3. Added ignore rules for `.venv/`, `.local-backups/`, and local SQLite files.
4. Updated README installation instructions and feature claims; added this audit.

No extension behavior changes, Django scaffolding, dependency installation, Git staging, commit, or push were performed.

## Validation and remaining work

JavaScript syntax, manifest JSON, referenced local assets, popup script references, icon dimensions, moved-file hashes, ignore rules, and Git whitespace checks are checked locally. Chrome/LeetCode interaction and live Groq calls require manual testing using the README checklist. Phase 0 runtime verification remains pending until those checks pass.

## Recommended order

Keep the folder move as a small reviewable change. Follow it with a separate fix for unsafe rendering and history clearing, including focused regression checks. Then begin minimal Django setup. Treat backend authentication, user ownership, input validation, bounded conversation context, timeouts, and quota enforcement as prerequisites for exposing the new AI API. Remove extension key storage and direct Groq permissions when the backend flow replaces them.
