# Panel authentication and reading improvements

This is a focused update to the existing extension. Backend APIs, JWT rotation/storage, Groq integration, conversation ownership, retry IDs, and the dark/turquoise visual identity remain intact.

## Authentication entry

Logged-out panels show **Login / Register** next to the account status. The worker opens only `chrome-extension://<extension-id>/auth.html` in a normal tab. That page reuses `popup.js` and its existing secure worker/API flow, including registration, password clearing, login, refresh rotation, and logout. The toolbar popup remains supported, but content scripts never attempt to open Chrome's action popup.

The separate extension origin matters: a password form embedded in LeetCode's DOM could be inspected by the page. No password field or token is added to the floating panel. Only exact trusted account-page/popup URLs can submit credentials. Supported top-frame LeetCode content scripts can request the fixed account page, ask for username-only state, and invoke logout. They cannot supply an arbitrary URL or obtain JWTs.

The existing worker auth-change broadcast clears stale UI and refreshes account state/history in open panels immediately after login or logout; no LeetCode refresh is required. The panel shows the username and Log out while signed in. Offline logout still reports unconfirmed server revocation; access tokens expire normally. An account tab can be closed after returning to LeetCode.

## Conversation layout

The previous flex layout allowed the chat to shrink to zero while the welcome/context and composer could not shrink. Installed Chrome reproduced a **33px** conversation at the allowed 480px panel minimum: header/account consumed 95px, context/status 122px, composer 228px, and borders 2px. Default chat height was only 215px at 1280?720. This was a space-allocation failure, not a height cap on an individual AI message.

The panel now uses grid rows `auto auto minmax(0, 1fr) auto auto` for header, account, content, loading and composer. Content has its own `auto auto minmax(0, 1fr) auto` grid for context, status, chat and optional jump button. Compact problem/language metadata and a grid composer leave the flexible conversation row substantially more space. **Conversation controls** is a native keyboard-accessible disclosure containing Reload history, Clear panel and New conversation; no functionality is removed. The minimum panel height is 620px when the viewport permits, bounded by viewport height minus 24px on smaller screens. Duplicate compact layout declarations and obsolete viewport height caps were consolidated into the original rules. Geometry no longer animates under the ResizeObserver, so expand/resize measurements use the final dimensions.

- Default frame: up to 500px wide, about 92% viewport height, capped at 860px.
- Expand: up to 960px wide and viewport height minus 24px; essential auth/mentor controls remain visible.
- Collapse: restores the prior frame dimensions/position and clamps them to the current viewport.
- Vertical resize: use the native bottom-right handle. Viewport limits update on resize/drag/browser resizing.
- Minimize: retains the existing header-only mode and restores reading mode/state afterward.
- Chat alone owns vertical response scrolling. Code blocks preserve whitespace and indentation, use monospace type, and scroll horizontally instead of stretching the panel.
- Prose wraps naturally, including long tokens. Safe text-node Markdown rendering and Copy Code buttons remain; no untrusted HTML parser is introduced.
- Scrolling near the bottom follows new responses. Scrolling up preserves your reading position and exposes Jump to latest response.

On narrow/short viewports, spacing and controls compact further. Native browser resizing, actual font metrics, zoom, and LeetCode CSS must still be checked manually. Extremely small viewports cannot show as much conversation at once. This update does not add a full-page conversation dashboard.

## Files

`auth.html` is the new trusted account page. `background.js`, `api-client.js`, and `popup.js` extend/reuse the existing authentication boundary. `content.js` adds account controls, state synchronization, reading geometry, and scroll-follow behavior. `styles.css` compacts the original design and makes chat the primary scroller. Focused tests extend the existing worker and DOM harnesses. `.env.example` is kept credential-free.

## Verification

```powershell
Set-Location 'C:\Users\Shivangi Ahuja\Desktop\Student Buddy'
node --test tests/extension.test.cjs tests/extension-integration.test.cjs
node tests/browser-layout.cjs
Set-Location .\backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test
```

The existing Node tests cover secure account-tab entry, registration/login through the reused worker, username-only state, logout, panel auth updates, expansion/collapse/minimize state, viewport bounds, scroll-up behavior, long text, safe Markdown/code/copy behavior, and the existing hint/persistence/retry cases. Node tests use a DOM double. The separate `tests/browser-layout.cjs` uses installed Chrome headless through the DevTools protocol, a fresh isolated profile, actual extension CSS/content code, and an offline LeetCode-shaped host fixture. All page network requests are intercepted; authentication, recovered messages and AI replies are mocked. It requires Node 22+ and Chrome at the standard Windows path (or set `$env:CHROME_PATH` to your Chromium executable). It writes screenshots and detailed `clientHeight`, `scrollHeight`, computed height and parent/panel dimensions to ignored `.local-backups/layout-*/` directories. `--measure-only` records sizes without assertions.

Chrome 157 measurements (pixels, long response with solution controls unlocked):

| Viewport | Before normal | After normal | Before expanded | After expanded |
| --- | ---: | ---: | ---: | ---: |
| 1366?768 | 260 | 360 | 324 | 424 |
| 1920?1080 | 413 | 513 | 636 | 736 |
| 1280?720 | 215 | 315 | 276 | 376 |
| 390?640 | 102 | 252 | 156 | 279 |
| 900?480 | 105 | 153 | 105 | 153 |

Attempting the previous 480px panel minimum now clamps to 620px on desktop, with 273px of chat instead of 33px. Browser assertions cover all these viewports, no input overlap, viewport bounds, expand/collapse state, native vertical resize, minimize/restore, long code horizontal scrolling, exact code copying, scroll-up preservation, jump-to-latest, accessible secondary controls and history restoration. Screenshots were visually inspected. This verifies the actual renderer on the offline fixture; **live LeetCode CSS, an installed-extension session and live Groq were not exercised**. The Django loopback contract still uses mocked Groq.

## Chrome reload and manual checklist

1. Start Django locally with `.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000` from `backend/`. Keep real credentials only in ignored `.env`.
2. Open `chrome://extensions/`, find Student Buddy, and click **Reload**. If not installed, enable Developer mode, click Load unpacked, and select the project's `chrome-extension` folder.
3. Refresh every open LeetCode problem tab so the new content script/CSS loads. Extension reload clears session-only sign-in, so expect to log in again.
4. On Two Sum, verify Login / Register is visible. Click it; an extension-owned account tab must open, not a LeetCode form or toolbar-popup automation.
5. Register a disposable test user or log in. Return to LeetCode without refreshing. Confirm username display, Log out, and recovered owned history. Test incorrect credentials and password confirmation errors; passwords must clear from the form.
6. Generate the three hints, submit a thought, and explicitly request a complete solution. Check explanation and time/space complexity readability. Existing correction and debug/explain actions should still work.
7. Click Expand, then Collapse. Verify large answer space, accessible controls, restored dimensions, and no offscreen edges. Drag the bottom-right handle vertically, drag the normal frame by its header, resize the browser, and test at 360px/540px widths and reduced height/zoom.
8. Minimize and restore in both reading modes. Check that only the chat has the main vertical scrollbar, with horizontal scrolling limited to wide code blocks.
9. Scroll up while a response is pending. The arriving answer must not jump you away. Click Jump to latest response to resume following.
10. Copy indented Python and long C++/Java lines; verify whitespace after paste. HTML-like user/AI text must remain inert text.
11. Log out from the panel. Confirm immediate account/UI reset and that late requests do not reappear. Log in through the account tab as another user and verify isolation.
12. Refresh/reopen the panel and verify owned history still restores. Clear panel, New conversation, and Delete saved conversation must retain their distinct semantics.

## Measure your live LeetCode panel

After reloading the extension and refreshing LeetCode, open the page DevTools Console and run the following. These measurements expose layout only, not tokens or message content:

```javascript
console.table(['student-buddy-panel', 'sb-content', 'sb-chat'].map(id => {
  const el = document.getElementById(id);
  const r = el.getBoundingClientRect();
  return {id, height: r.height, clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight, computedHeight: getComputedStyle(el).height,
    top: r.top, bottom: r.bottom};
}));
```

Repeat in normal/expanded modes at 1366?768, 1920?1080 and 1280?720 (DevTools device toolbar with a responsive viewport). Request a full solution, scroll from its first paragraph through its final complexity explanation, then check Copy Code. Test the smallest resize, open Conversation controls, minimize/restore, and refresh to recover history. Browser zoom, loaded fonts and live host CSS may change exact pixels; desktop normal chat should remain comfortably around 300px or more at the default size.

## Security note

Any real key pasted into `.env.example`, a chat, screenshot, or commit should be revoked and replaced privately. Removing it from the current file is insufficient if an unpublished commit still contains it; do not push that history. Keep example credentials as placeholders; no commit or push is performed by this layout fix. Git reflogs/local backups may retain old data even after an unpublished commit is amended, so key revocation is still necessary.
