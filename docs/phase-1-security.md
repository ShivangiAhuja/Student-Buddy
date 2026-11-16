# Phase 1: extension security and stability

## Changes

- `content.js`: messages use DOM nodes and text content; only the static panel template uses HTML. The extracted title is assigned as text. Headings, bold, inline code, lists, code fences, copy buttons, and correction actions remain available. Fenced code preserves indentation and supports language labels such as C++ and C#.
- `content.js`: chat messages now belong to `#sb-chat`. Clearing resets messages, the in-memory history array, draft input, progress, solution unlock, last solution, button state, and loading state. A generation counter discards replies and errors from requests started before clearing. There is no persistent conversation store to clear.
- `content.js`: only one request per current conversation can run at a time. Successful hints advance progress. The solution listener is attached once, without delayed listener replacement. Editor template extraction now happens synchronously before requests.
- `content.js`: exact language aliases and editor-scoped code heuristics replace broad substring matching. Python3 is recognized. Automatic updates synchronize the badge and dropdown; a manual choice remains active until page reload.
- `background.js`: all three AI flows use the same 25-second abort timeout (including response body reading), HTTP status handling, JSON parsing, and nonempty string response validation. Provider error bodies and diagnostic content are not logged or shown. Async Chrome message channels still return `true`.
- `popup.js`: handles settings load failures, checks the actual LeetCode problem URL, and requires acknowledgement before reporting history cleared.
- `icons/icon48.png`: downsampled the existing 128px artwork to 48px, preserving the design.
- `tests/extension.test.cjs`: focused tests using Node's built-in runner; no dependency installation or framework.

The Phase 0 audit remains a historical record of the pre-fix source. The manifest and permissions are unchanged; all script assets are local, and no eval or remotely hosted JavaScript was introduced. Static MV3 checks pass; this is not a Chrome runtime certification.

## Manual Chrome test procedure

1. Open `chrome://extensions/`. Enable Developer mode. Reload Student Buddy, or use **Load unpacked** and choose `C:\Users\Shivangi Ahuja\Desktop\Student Buddy\chrome-extension`.
2. Refresh an open LeetCode problem page. Check the extension error list and service worker console. Verify the popup and icons display.
3. Expand, minimize, and drag the panel. Check Ctrl+Shift+M, Enter, and Shift+Enter. Confirm the title is plain text.
4. Change LeetCode's language before manually selecting a language in Student Buddy. Wait at least three seconds; the badge and dropdown should agree. Select a language manually, wait again, and confirm automatic detection does not replace it. Reload to resume automatic detection.
5. Enter `<img src=x onerror=alert(1)>` as a thought. It must appear as literal text without an image or alert. Test bold and inline code. With a development key, check formatted AI responses and code copy/paste, including indentation and C++ code fences.
6. Request all three hint levels. Failed requests must not advance progress. After three successful hints, request a complete solution and try both correction actions. Repeated clicks while waiting should not start duplicate requests.
7. Clear history through the popup. Verify all visible messages disappear, the draft is empty, progress resets, and the solution section hides. Complete three hints again and verify the solution button works again.
8. Start a request and immediately clear history. Wait for its response; no old message should reappear. A new thought should still work.
9. Test without a saved key, with an invalid key, and with networking disabled for the extension service worker. Confirm readable errors and recovery on the next request. Use the service worker's network controls where available; a page-only offline setting may not affect the worker. Malformed payload and timeout cases are covered by mocks; do not claim these were observed live without testing them.
10. Navigate away from LeetCode and try popup history clearing. Confirm it reports that a problem page is required. Refresh a problem page and verify conversation state starts empty.

## Remaining limitations

The legacy key is still in Chrome sync storage and requests still go directly to Groq until backend integration. AI prompt history is still unused and conversations are not persistent. LeetCode DOM extraction, SPA navigation, missing asynchronously loaded content, truncated statements, and Monaco visible-line extraction remain limitations. Language detection is best effort; manual selection is the fallback. Clearing ignores an old network response but does not cancel the provider request, which may still consume quota. The CSS still imports Google Fonts.

Automated tests use a small DOM double, not a full browser engine. Chrome, live Groq, visual appearance, clipboard permissions, and current LeetCode compatibility require the manual checks above.

## Suggested next phase

Create a minimal Django/DRF project inside `backend/`, a local virtual environment, environment-based settings, and a tested health endpoint. Keep the extension runnable while learning Django settings, URL routing, views, and tests. Add database models, JWT ownership checks, and backend-only Groq credentials in subsequent small stages.
