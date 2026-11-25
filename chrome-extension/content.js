// content.js - Injected into LeetCode pages

let panelAuthVersion = 0;
let readingGeometry = null;
let followNewMessages = true;
let historyVersion = 0;
let requestInFlight = false;
let manualLanguage = false;
let retryAction = null;
let lastRoute = '';
let pendingOldProblem = null;
let mentorPanel = null;
let conversationHistory = [];
let currentProblem = null;
let hintsUsed = 0;
let solutionUnlocked = false;
let preferredLanguage = 'Python'; // Default
let currentCodeTemplate = ''; // Store the LeetCode template
let lastSolutionCode = ''; // Store last solution for corrections
// Initialize the extension
function init() {
  extractProblemInfo();
  detectLanguage();
  extractCodeTemplate();
  createMentorPanel();
  setupMessageListener();
  startLanguageMonitoring();
  lastRoute = canonicalPageURL();
  setInterval(monitorContext, 800);
  refreshPanelAuth();
}
function canonicalPageURL() {
  try {
    const url = new URL(location.href);
    const slug = url.pathname.match(/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/i)?.[1];
    return slug ? `https://leetcode.com/problems/${slug.toLowerCase()}/` : '';
  } catch { return ''; }
}
function extractProblemInfo() {
  const firstOutsidePanel = selector => Array.from(document.querySelectorAll(selector)).find(node => !node.closest('#student-buddy-panel'));
  const titleElement = firstOutsidePanel('[data-cy="question-title"], .text-title-large, [class*="text-title"]');
  const descElement = firstOutsidePanel('[data-track-load="description_content"], .elfjS, .question-content');
  const title = (titleElement?.innerText || titleElement?.textContent || '').trim();
  const description = (descElement?.innerText || descElement?.textContent || '').trim();
  const url = canonicalPageURL();
  if (!url || !title || !description || title.length > 255 || description.length > 30000) {
    currentProblem = null;
    return null;
  }
  const titleLink = titleElement.closest('a[href]');
  if (titleLink && new URL(titleLink.href, location.href).pathname.split('/')[2] !== new URL(url).pathname.split('/')[2]) {
    currentProblem = null;
    return null;
  }
  if (pendingOldProblem && (title === pendingOldProblem.title || description === pendingOldProblem.description)) {
    currentProblem = null;
    return null;
  }
  pendingOldProblem = null;
  currentProblem = { title, description, url };
  const label = document.querySelector('#student-buddy-panel .sb-problem-title');
  if (label) label.textContent = title;
  return currentProblem;
}
function monitorContext() {
  const route = canonicalPageURL();
  if (route !== lastRoute) {
    pendingOldProblem = currentProblem;
    lastRoute = route;
    currentProblem = null;
    manualLanguage = false;
    clearConversation();
    setPanelStatus('Problem changed. Waiting for its title and statement...');
  }
  if (!currentProblem && extractProblemInfo()) {
    detectLanguage();
    restoreConversation();
  }
}
function switchLanguageContext() {
  clearConversation();
  restoreConversation();
}
function setPanelStatus(text) {
  const status = document.getElementById('sb-session-status');
  if (status) status.textContent = text;
}
function renderPanelAccount(user) {
  document.getElementById('sb-account-label').textContent = user ? `Signed in as ${user.username}` : 'Sign in to save your progress';
  document.getElementById('sb-login-btn').hidden = !!user;
  document.getElementById('sb-logout-btn').hidden = !user;
}
async function refreshPanelAuth() {
  const version = ++panelAuthVersion;
  try {
    const state = await chrome.runtime.sendMessage({ action: 'panelAuthState' });
    if (version !== panelAuthVersion) return;
    if (!state?.success) throw new Error(state?.error || 'Could not check your session.');
    renderPanelAccount(state.user);
    if (state.user) await restoreConversation();
    else setPanelStatus('Use Login / Register above to open your secure account page.');
  } catch (error) {
    if (version !== panelAuthVersion) return;
    renderPanelAccount(null);
    setPanelStatus(error.message);
  }
}
async function openAccountPage() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'openAuth' });
    if (!result?.success) throw new Error(result?.error || 'Could not open the account page.');
    setPanelStatus('Sign in in the Student Buddy account tab, then return here.');
  } catch (error) { setPanelStatus(error.message); }
}
async function logoutFromPanel() {
  ++panelAuthVersion;
  clearConversation();
  renderPanelAccount(null);
  try {
    const result = await chrome.runtime.sendMessage({ action: 'panelLogout' });
    if (!result?.success || !result.storageCleared) throw new Error(result?.error || 'Could not clear extension storage. Disable the extension and clear its storage.');
    setPanelStatus(result.revoked ? 'Logged out. Use Login / Register to sign in.' : 'Signed out locally. Server revocation is unconfirmed; tokens expire normally.');
  } catch (error) { setPanelStatus(error.message); }
}
function panelDimensions(viewportWidth, viewportHeight, expanded) {
  const availableWidth = Math.max(0, viewportWidth - 24);
  const availableHeight = Math.max(0, viewportHeight - 24);
  return { width: Math.min(expanded ? 960 : 500, availableWidth),
    height: Math.min(expanded ? availableHeight : Math.round(viewportHeight * 0.92), availableHeight, expanded ? Infinity : 860) };
}
function fitPanelToViewport() {
  if (!mentorPanel) return;
  const rect = mentorPanel.getBoundingClientRect();
  const minimized = mentorPanel.classList.contains('sb-minimized');
  const maxWidth = Math.max(0, window.innerWidth - 24);
  const height = Math.min(rect.height, Math.max(0, window.innerHeight - 24));
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(rect.width, maxWidth) - 12));
  const top = Math.max(12, Math.min(rect.top, window.innerHeight - height - 12));
  Object.assign(mentorPanel.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto',
    maxWidth: maxWidth + 'px', maxHeight: Math.max(0, window.innerHeight - top - 12) + 'px' });
  if (!minimized && rect.height > window.innerHeight - 24) mentorPanel.style.height = height + 'px';
}
function toggleReadingMode() {
  const expanded = !mentorPanel.classList.contains('sb-reading');
  const fields = ['width', 'height', 'top', 'left', 'right', 'bottom', 'maxHeight'];
  if (expanded) {
    readingGeometry = Object.fromEntries(fields.map(key => [key, mentorPanel.style[key] || '']));
    const size = panelDimensions(window.innerWidth, window.innerHeight, true);
    Object.assign(mentorPanel.style, { width: size.width + 'px', height: size.height + 'px',
      top: '12px', left: (window.innerWidth - size.width) / 2 + 'px', right: 'auto', bottom: 'auto', maxHeight: size.height + 'px' });
  } else if (readingGeometry) Object.assign(mentorPanel.style, readingGeometry);
  mentorPanel.classList.toggle('sb-reading', expanded);
  const button = document.getElementById('sb-reading-btn');
  button.textContent = expanded ? 'Collapse' : 'Expand';
  button.setAttribute('aria-pressed', String(expanded));
  fitPanelToViewport();
}
function scrollToLatest() {
  const chat = document.getElementById('sb-chat');
  chat.scrollTop = chat.scrollHeight;
  document.getElementById('sb-latest-btn').hidden = true;
}
function contextData() {
  if (!currentProblem) throw new Error('Problem data is missing or changed. Wait for LeetCode to load, then reload saved history.');
  return { problem: { ...currentProblem }, language: preferredLanguage };
}
async function restoreConversation() {
  const version = ++historyVersion;
  if (!currentProblem) { setPanelStatus('Waiting for LeetCode problem data...'); return; }
  requestInFlight = true;
  setPanelStatus('Loading saved conversation...');
  try {
    const captured = contextData();
    const response = await chrome.runtime.sendMessage({ action: 'mentorRecover', data: captured });
    if (version !== historyVersion || captured.problem.url !== canonicalPageURL() || captured.language !== preferredLanguage) return;
    if (!response?.success) throw new Error(response?.error || 'Could not load saved history.');
    document.getElementById('sb-chat').replaceChildren();
    hintsUsed = 0;
    let previousUser = '';
    for (const message of response.messages) {
      if (message.role === 'user') {
        previousUser = message.content;
        if (/^Mentor request: hint level [123]\n/.test(previousUser)) hintsUsed++;
        addMessageToChat('user', message.content);
      } else {
        const solution = /^Mentor request: (hint level 4|solution)\n/.test(previousUser);
        if (solution) lastSolutionCode = message.content;
        addMessageToChat(solution ? 'solution' : 'mentor', message.content, solution);
      }
    }
    updateProgress();
    if (response.pendingAction) {
      retryAction = { ...captured, ...response.pendingAction };
      document.getElementById('sb-retry-btn').hidden = false;
    }
    setPanelStatus(response.truncated ? 'Showing the latest 50 saved messages.' : response.missing ? 'Saved conversation is unavailable. Your next action starts a new one.' : response.conversationId ? 'Saved conversation restored.' : 'Ready. Your next action starts a conversation.');
    if (response.pendingAction) setPanelStatus('A previous request has an uncertain result. Retry request checks the same action without creating a new turn.');
  } catch (error) { if (version === historyVersion) setPanelStatus(error.message || 'Could not load saved history.'); }
  finally { if (version === historyVersion) { requestInFlight = false; showLoading(false); } }
}
// NEW: Extract the code template from LeetCode editor
function extractCodeTemplate() {
  try {
    // Read available editor content immediately before sending a request.
    currentCodeTemplate = '';
      // Try to get code from Monaco editor
      const editorContent = document.querySelector('.monaco-editor');
      if (editorContent) {
        // Try to get the actual text content
        const lines = editorContent.querySelectorAll('.view-line');
        if (lines.length > 0) {
          currentCodeTemplate = Array.from(lines)
            .map(line => line.textContent)
            .join('\n')
            .trim();
          
        }
      }
      
      // Alternative: Try to get from textarea or other elements
      if (!currentCodeTemplate) {
        const codeAreas = document.querySelectorAll('textarea[class*="code"], div[class*="code-editor"]');
        for (const area of codeAreas) {
          if (area.value || area.textContent) {
            currentCodeTemplate = area.value || area.textContent;
            break;
          }
        }
      }
  } catch (error) {
    currentCodeTemplate = '';
  }
}
// Detect the programming language the user is using
const languageAliases = {
  cpp: 'C++', 'c++': 'C++', c: 'C', java: 'Java', python: 'Python', python3: 'Python',
  javascript: 'JavaScript', typescript: 'TypeScript', csharp: 'C#', 'c#': 'C#',
  go: 'Go', golang: 'Go', ruby: 'Ruby', swift: 'Swift', kotlin: 'Kotlin',
  rust: 'Rust', php: 'PHP', scala: 'Scala'
};
function normalizeLanguage(value) {
  return languageAliases[(value || '').trim().toLowerCase()] || null;
}
function detectLanguage() {
  if (manualLanguage) return;
  const previousLanguage = preferredLanguage;
  let detected = null;
  for (const editor of document.querySelectorAll('.monaco-editor [data-mode-id], .monaco-editor[data-mode-id], .monaco-editor[data-language]')) {
    detected = normalizeLanguage(editor.getAttribute('data-mode-id') || editor.getAttribute('data-language'));
    if (detected) break;
  }
  if (!detected) {
    for (const button of document.querySelectorAll('button[id*="headlessui-listbox-button"], [class*="language"] button')) {
      if (button.closest('#student-buddy-panel')) continue;
      detected = normalizeLanguage(button.innerText || button.textContent);
      if (detected) break;
    }
  }
  if (!detected) {
    const code = Array.from(document.querySelectorAll('.monaco-editor .view-line')).slice(0, 15).map(line => line.textContent).join('\n');
    if (/\b(vector<|std::|unordered_map|public:)/.test(code)) detected = 'C++';
    else if (/\bdef\s+\w+\s*\(|class Solution:/.test(code)) detected = 'Python';
    else if (/\b(public class|public int|ArrayList|HashMap)\b/.test(code)) detected = 'Java';
    else if (/\b(const|let|var)\s+\w+/.test(code)) detected = 'JavaScript';
  }
  if (detected) preferredLanguage = detected;
  const badge = document.getElementById('sb-language-text');
  const dropdown = document.getElementById('sb-language-dropdown');
  if (badge) badge.textContent = preferredLanguage;
  if (dropdown) dropdown.value = preferredLanguage;
  if (mentorPanel && previousLanguage !== preferredLanguage) switchLanguageContext();
}
function startLanguageMonitoring() {
  setInterval(detectLanguage, 3000);
}

// Create the floating mentor panel
function createMentorPanel() {
  // Check if panel already exists
  if (document.getElementById('student-buddy-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'student-buddy-panel';
  panel.className = 'sb-panel';
  
  panel.innerHTML = `
    <div class="sb-header">
      <div class="sb-title">
        <span class="sb-icon">🎓</span>
        <span>Student Buddy</span>
      </div>
      <div class="sb-header-actions"><button class="sb-reading-toggle" id="sb-reading-btn" aria-pressed="false">Expand</button>
      <button class="sb-toggle" id="sb-toggle-btn" aria-label="Minimize panel" title="Minimize panel">▼</button>
      </div>
    </div>
    <div class="sb-account-row">
      <span id="sb-account-label">Sign in to save your progress</span>
      <button id="sb-login-btn" class="sb-account-button">Login / Register</button>
      <button id="sb-logout-btn" class="sb-account-button" hidden>Log out</button>
    </div>
    <div class="sb-content" id="sb-content">
      <div class="sb-welcome">
        <div class="sb-welcome-header">
          <div class="sb-welcome-emoji">👋</div>
          <div class="sb-welcome-text">
            <h2>Hi! I'm your AI mentor.</h2>
            <p>Share your reasoning. Use hints first, then request a solution when ready.</p>
          </div>
        </div>
        
        <div class="sb-problem-card">
          <div class="sb-problem-label">Problem:</div>
          <div class="sb-problem-title"></div>
          <div class="sb-language-selector">
            <label for="sb-language-dropdown">Language</label>
            <select class="sb-language-dropdown" id="sb-language-dropdown">
              <option value="C++">C++</option>
              <option value="Java">Java</option>
              <option value="Python" selected>Python</option>
              <option value="JavaScript">JavaScript</option>
              <option value="TypeScript">TypeScript</option>
              <option value="C">C</option>
              <option value="C#">C#</option>
              <option value="Go">Go</option>
              <option value="Ruby">Ruby</option>
              <option value="Swift">Swift</option>
              <option value="Kotlin">Kotlin</option>
              <option value="Rust">Rust</option>
              <option value="PHP">PHP</option>
              <option value="Scala">Scala</option>
            </select>
          </div>
        </div>

        <div class="sb-progress-tracker" id="sb-progress">
          <div class="sb-progress-bar">
            <div class="sb-progress-fill" id="sb-progress-fill" style="width: 0%"></div>
          </div>
          <div class="sb-progress-text" id="sb-progress-text">
            💡 Try hints first to learn better!
          </div>
        </div>
      </div>
      
      <div id="sb-session-status" class="sb-session-status" role="status" aria-live="polite">Use Login / Register above to sign in securely.</div>
      <div class="sb-chat" id="sb-chat" tabindex="0" aria-label="Mentor conversation"></div>
      <button id="sb-latest-btn" class="sb-latest-button" hidden>Jump to latest response</button>
    </div>

    <div class="sb-loading" id="sb-loading" style="display: none;">
      <div class="sb-spinner"></div>
      <span>Thinking...</span>
    </div>

    <div class="sb-input-area">
      <textarea 
        id="sb-thought-input" 
        placeholder="What are you thinking? Share your approach or ask for a hint..."
        rows="2"
        maxlength="6000"
      ></textarea>
      
      <div class="sb-actions">
        <div class="sb-hint-levels">
          <button class="sb-hint-btn" data-level="1">💡 First Hint</button>
          <button class="sb-hint-btn" data-level="2">🔦 Stronger Hint</button>
          <button class="sb-hint-btn" data-level="3">🎯 Direct Nudge</button>
        </div>
        <select class="sb-language-dropdown" id="sb-chat-mode" aria-label="Mentor action">
          <option value="discuss">Approach feedback</option>
          <option value="debug">Debug my code</option>
          <option value="explain">Explain my code</option>
        </select>
        <button class="sb-send-btn" id="sb-send-btn">Send Thought</button>
        <button class="sb-action-btn" id="sb-retry-btn" hidden>Retry request</button>
        <details class="sb-secondary-controls">
          <summary>Conversation controls</summary>
          <div class="sb-session-controls">
          <button class="sb-action-btn" id="sb-reload-btn">Reload history</button>
          <button class="sb-action-btn" id="sb-clear-btn">Clear panel</button>
          <button class="sb-action-btn" id="sb-new-btn">New conversation</button>
          </div>
        </details>
        
        <div class="sb-solution-section" id="sb-solution-section" style="display: none;">
          <div class="sb-solution-divider">
            <span>Still Stuck?</span>
          </div>
          <button class="sb-solution-btn" id="sb-solution-btn">
            🔓 Show Complete Solution
          </button>
        </div>
      </div>
    </div>
  `;
  
  panel.querySelector('.sb-problem-title').textContent = currentProblem?.title || 'Waiting for problem data...';
  document.body.appendChild(panel);
  mentorPanel = panel;
  const size = panelDimensions(window.innerWidth, window.innerHeight, false);
  Object.assign(panel.style, { width: size.width + 'px', height: size.height + 'px', top: '12px', right: '12px', bottom: 'auto' });
  window.addEventListener('resize', fitPanelToViewport);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitPanelToViewport).observe(panel);
  
  // Update language badge and dropdown
  const languageBadge = document.getElementById('sb-language-text');
  const languageDropdown = document.getElementById('sb-language-dropdown');
  
  if (languageBadge) {
    languageBadge.textContent = preferredLanguage;
  }
  
  if (languageDropdown) {
    languageDropdown.value = preferredLanguage;
    
    // Listen for manual language changes
    languageDropdown.addEventListener('change', (e) => {
      if (!e.isTrusted) return;
      manualLanguage = true;
      preferredLanguage = e.target.value;
      if (languageBadge) languageBadge.textContent = preferredLanguage;
      switchLanguageContext();
    });
  }
  
  // Add event listeners
  setupEventListeners();
  
  // Add keyboard shortcut (Ctrl/Cmd + Shift + M to toggle)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      togglePanel();
    }
  });
}

function setupEventListeners() {
  document.getElementById('sb-login-btn').addEventListener('click', event => { if (event.isTrusted) openAccountPage(); });
  document.getElementById('sb-logout-btn').addEventListener('click', event => { if (event.isTrusted) logoutFromPanel(); });
  document.getElementById('sb-reading-btn').addEventListener('click', event => { if (event.isTrusted) toggleReadingMode(); });
  const chat = document.getElementById('sb-chat');
  chat.addEventListener('scroll', () => { followNewMessages = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 64; if (followNewMessages) document.getElementById('sb-latest-btn').hidden = true; });
  document.getElementById('sb-latest-btn').addEventListener('click', () => { followNewMessages = true; scrollToLatest(); });
  // Toggle panel
  const toggleBtn = document.getElementById('sb-toggle-btn');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent drag when clicking toggle
    togglePanel();
  });
  
  // Make panel draggable by header
  const header = document.querySelector('.sb-header');
  makeDraggable(header, mentorPanel);
  
  // Also make entire panel draggable when minimized
  mentorPanel.addEventListener('mousedown', (e) => {
    if (mentorPanel.classList.contains('sb-minimized') && 
        !e.target.closest('#sb-toggle-btn')) {
      // Trigger drag on the whole panel when minimized
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: false,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY
      });
      header.dispatchEvent(mouseDownEvent);
    }
  });
  
  document.getElementById('sb-reload-btn').addEventListener('click', event => { if (event.isTrusted) { clearConversation(); extractProblemInfo(); restoreConversation(); } });
  document.getElementById('sb-clear-btn').addEventListener('click', event => { if (event.isTrusted) clearConversation(); });
  document.getElementById('sb-new-btn').addEventListener('click', event => { if (event.isTrusted) resetSavedConversation('newConversation'); });
  document.getElementById('sb-retry-btn').addEventListener('click', event => { if (event.isTrusted && retryAction) performMentor(retryAction); });
  document.getElementById('sb-solution-btn').addEventListener('click', event => { if (event.isTrusted) showSolution(); });
  // Send button
  document.getElementById('sb-send-btn').addEventListener('click', event => { if (event.isTrusted) sendThought(0); });
  
  // Hint level buttons
  document.querySelectorAll('.sb-hint-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      const level = parseInt(e.target.dataset.level);
      
      // Visual feedback
      e.target.style.opacity = '0.5';
      e.target.style.transform = 'scale(0.95)';
      setTimeout(() => {
        e.target.style.opacity = '1';
        e.target.style.transform = 'scale(1)';
      }, 200);
      
      // Track hint usage and update progress


      
      // Send the hint request
      sendThought(level);
    });
  });
  
  // Enter to send (Shift+Enter for new line)
  document.getElementById('sb-thought-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!e.isTrusted) return;
      e.preventDefault();
      sendThought(0);
    }
  });
}

// Make panel draggable
function makeDraggable(handle, element) {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;
  
  handle.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  function dragStart(e) {
    // Don't drag if clicking the toggle button
    if (e.target.closest('button') || e.target.closest('select') || element.classList.contains('sb-reading')) {
      return;
    }
    
    // Get the current position
    const rect = element.getBoundingClientRect();
    
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    
    isDragging = true;
    handle.style.cursor = 'grabbing';
    element.style.transition = 'none'; // Disable transition during drag
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));
    
    // Apply the new position immediately
    element.style.left = currentX + 'px';
    element.style.top = currentY + 'px';
    element.style.bottom = 'auto';
    element.style.right = 'auto';
    fitPanelToViewport();
  }
  
  function dragEnd() {
    if (isDragging) {
      isDragging = false;
      handle.style.cursor = 'grab';
      element.style.transition = ''; // Re-enable transitions
    }
  }
}

function togglePanel() {
  mentorPanel.classList.toggle('sb-minimized');
  const btn = document.getElementById('sb-toggle-btn');
  const isMinimized = mentorPanel.classList.contains('sb-minimized');
  btn.textContent = isMinimized ? '▲' : '▼';
  btn.title = isMinimized ? 'Restore panel' : 'Minimize panel';
  btn.setAttribute('aria-label', btn.title);
  fitPanelToViewport();
}

async function sendThought(hintLevel) {
  if (requestInFlight) return;
  const thought = document.getElementById('sb-thought-input').value.trim();
  const mode = document.getElementById('sb-chat-mode')?.value || 'discuss';
  if (!thought && hintLevel === 0 && mode === 'discuss') return;
  if (mode !== 'discuss') extractCodeTemplate();
  try {
    const data = { ...contextData(), kind: hintLevel ? 'hint' : mode, hintLevel,
      userThought: thought, code: hintLevel || mode === 'discuss' ? '' : currentCodeTemplate };
    await performMentor(data);
  } catch (error) { setPanelStatus(error.message); }
}
async function performMentor(data) {
  if (requestInFlight) return;
  const version = historyVersion;
  requestInFlight = true;
  retryAction = null;
  const retryButton = document.getElementById('sb-retry-btn');
  if (retryButton) retryButton.hidden = true;
  showLoading(true);
  setPanelStatus('Thinking...');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'mentorTurn', data });
    if (version !== historyVersion || data.problem.url !== canonicalPageURL() || data.language !== preferredLanguage) return;
    if (!response?.success) {
      if (response?.retryable) { retryAction = response.resumeAction ? { ...data, ...response.resumeAction } : data; if (retryButton) retryButton.hidden = false; }
      throw new Error(response?.error || 'Backend request failed.');
    }
    if (typeof response.message !== 'string' || !response.message.trim()) throw new Error('Backend returned an unusable response.');
    const solution = ['solution', 'correction'].includes(data.kind) || data.hintLevel === 4;
    if (data.userThought) addMessageToChat('user', data.userThought);
    addMessageToChat(solution ? 'solution' : 'mentor', response.message, solution);
    if (solution) lastSolutionCode = response.message;
    if (data.kind === 'hint' && data.hintLevel < 4) { hintsUsed++; updateProgress(); }
    document.getElementById('sb-thought-input').value = '';
    setPanelStatus('Saved to your conversation.');
  } catch (error) {
    if (version !== historyVersion) return;
    // A lost worker reply is ambiguous too. Keep this logical action for retry.
    if (!(error instanceof Error) || !error.message) setPanelStatus('Extension worker unavailable. Reload the extension.');
    else setPanelStatus(error.message);
    if (!retryAction && /extension|receiving end|message port/i.test(error.message || '')) {
      retryAction = data; if (retryButton) retryButton.hidden = false;
    }
  } finally { if (version === historyVersion) { requestInFlight = false; showLoading(false); } }
}

// IMPROVED: Add messages with optional correction buttons
function addMessageToChat(role, message, allowCorrection = false) {
  const content = document.getElementById('sb-chat');
  if (!content) return;
  
  // Remove welcome message
  const welcome = content.querySelector('.sb-welcome-message');
  if (welcome) {
    welcome.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `sb-message sb-message-${role}`;
  
  // Format message with markdown-like code blocks
  const shouldFollow = followNewMessages;
  const formattedMessage = formatMessage(message);
  
  const messageContent = document.createElement('div');
  messageContent.className = 'sb-message-content';
  messageContent.appendChild(formattedMessage);
  messageDiv.appendChild(messageContent);
  
  // Add correction buttons for solution messages - inside the content div
  if (allowCorrection && role === 'solution') {
    const contentDiv = messageDiv.querySelector('.sb-message-content');
    const actionDiv = document.createElement('div');
    actionDiv.className = 'sb-solution-actions';
    
    const wrongBtn = document.createElement('button');
    wrongBtn.className = 'sb-action-btn sb-wrong-btn';
    wrongBtn.textContent = '❌ Wrong Answer - Get Correction';
    wrongBtn.onclick = function(event) { if (event.isTrusted) requestCorrection(); };
    
    const describeBtn = document.createElement('button');
    describeBtn.className = 'sb-action-btn sb-describe-btn';
    describeBtn.textContent = '📝 Describe the Issue';
    describeBtn.onclick = function(event) { if (event.isTrusted) requestCorrectionWithDetails(); };
    
    actionDiv.appendChild(wrongBtn);
    actionDiv.appendChild(describeBtn);
    contentDiv.appendChild(actionDiv);
  }
  
  content.appendChild(messageDiv);
  mentorPanel?.classList.add('sb-has-messages');
  if (shouldFollow) scrollToLatest();
  else document.getElementById('sb-latest-btn').hidden = false;
}
// Render a small Markdown subset without parsing any untrusted HTML.
function appendInline(parent, text) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parent.appendChild(document.createTextNode(text.slice(start, match.index)));
    const code = match[0].startsWith('`');
    const node = document.createElement(code ? 'code' : 'strong');
    if (code) node.className = 'sb-inline-code';
    node.textContent = match[0].slice(code ? 1 : 2, code ? -1 : -2);
    parent.appendChild(node);
    start = match.index + match[0].length;
  }
  parent.appendChild(document.createTextNode(text.slice(start)));
}
function formatMessage(message) {
  const fragment = document.createDocumentFragment();
  const lines = String(message ?? '').replace(/\r\n/g, '\n').split('\n');
  let list = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```([^`]*)$/);
    if (fence) {
      list = null;
      const codeLines = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) codeLines.push(lines[i]);
      const block = document.createElement('div'); block.className = 'sb-code-block';
      const header = document.createElement('div'); header.className = 'sb-code-header';
      const lang = document.createElement('span'); lang.className = 'sb-code-lang'; lang.textContent = fence[1] || 'code';
      const button = document.createElement('button'); button.className = 'sb-copy-btn'; button.textContent = 'Copy Code';
      const pre = document.createElement('pre'); const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      button.addEventListener('click', () => copyCodeText(code.textContent, button));
      header.append(lang, button); pre.appendChild(code); block.append(header, pre); fragment.appendChild(block);
      continue;
    }
    const bullet = lines[i].match(/^[\u2022*-]\s+(.+)$/);
    const heading = lines[i].match(/^##\s+(.+)$/);
    if (bullet) {
      if (!list) { list = document.createElement('ul'); list.className = 'sb-list'; fragment.appendChild(list); }
      const item = document.createElement('li'); appendInline(item, bullet[1]); list.appendChild(item);
    } else {
      list = null;
      if (heading) {
        const h = document.createElement('h3'); h.className = 'sb-heading'; appendInline(h, heading[1]); fragment.appendChild(h);
      } else { appendInline(fragment, lines[i]); if (i < lines.length - 1) fragment.appendChild(document.createElement('br')); }
    }
  }
  return fragment;
}
async function copyCodeText(text, button) {
  try {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const textarea = document.createElement('textarea'); textarea.value = text;
      textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea);
      try { textarea.select(); if (!document.execCommand('copy')) throw new Error('Copy failed'); }
      finally { textarea.remove(); }
    }
    button.textContent = '\u2705 Copied!';
  } catch { button.textContent = '\u274c Copy failed'; }
  setTimeout(() => { button.textContent = 'Copy Code'; }, 2000);
}

function showLoading(show) {
  document.getElementById('sb-loading').style.display = show ? 'flex' : 'none';
}

function updateProgress() {
  
  const progressFill = document.getElementById('sb-progress-fill');
  const progressText = document.getElementById('sb-progress-text');
  const solutionSection = document.getElementById('sb-solution-section');
  
  if (!progressFill || !progressText || !solutionSection) {
    return;
  }
  
  // Calculate progress (unlock after 3 hints)
  const progress = Math.min((hintsUsed / 3) * 100, 100);
  progressFill.style.width = progress + '%';
  
  
  if (hintsUsed === 0) {
    progressText.textContent = '💡 Try hints first to learn better!';
  } else if (hintsUsed === 1) {
    progressText.textContent = '🌱 Good start! Keep trying...';
    progressFill.style.background = 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)';
  } else if (hintsUsed === 2) {
    progressText.textContent = '🔥 You\'re making progress!';
    progressFill.style.background = 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)';
  } else if (hintsUsed >= 3 && !solutionUnlocked) {
    progressText.textContent = '✨ Solution unlocked! You gave it a real try.';
    progressFill.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)';
    solutionSection.style.display = 'block';
    solutionUnlocked = true;
    
    
    solutionSection.classList.add('sb-solution-unlocked');
  }
}

async function showSolution() {
  if (requestInFlight || !confirm('Request a complete solution with explanation and complexity?')) return;
  extractCodeTemplate();
  try {
    await performMentor({ ...contextData(), kind: 'solution', userThought: 'Please give a complete solution with explanation, time and space complexity. Preserve the supplied LeetCode class and function signature.', code: currentCodeTemplate });
  } catch (error) { setPanelStatus(error.message); }
}
async function requestCorrection(errorMessage = '') {
  if (requestInFlight) return;
  extractCodeTemplate();
  try {
    await performMentor({ ...contextData(), kind: 'correction', userThought: 'Please correct the previous complete solution, explain the bug and complexity, and preserve the supplied signature. ' + errorMessage, code: currentCodeTemplate });
  } catch (error) { setPanelStatus(error.message); }
}
function requestCorrectionWithDetails() {
  const detail = prompt('Describe the issue or failing example:');
  if (detail) requestCorrection(detail);
}
async function resetSavedConversation(action) {
  let data;
  try { data = contextData(); } catch (error) { setPanelStatus(error.message); return { success: false, error: error.message }; }
  clearConversation();
  const version = historyVersion;
  try {
    const result = await chrome.runtime.sendMessage({ action, data });
    if (version !== historyVersion) return { success: false, error: 'Panel context changed.' };
    if (!result?.success) throw new Error(result?.error || 'Could not update saved conversation.');
    setPanelStatus(action === 'newConversation' ? 'Ready for a new conversation. Previous saved history was kept.' : result.deleted ? 'Saved conversation deleted.' : 'There is no saved conversation to delete.');
    return { success: true, deleted: result.deleted };
  } catch (error) { if (version === historyVersion) setPanelStatus(error.message); return { success: false, error: error.message }; }
}

function clearConversation() {
  historyVersion++;
  requestInFlight = false;
  conversationHistory = [];
  followNewMessages = true;
  mentorPanel?.classList.remove('sb-has-messages');
  const latest = document.getElementById('sb-latest-btn');
  if (latest) latest.hidden = true;
  hintsUsed = 0;
  solutionUnlocked = false;
  lastSolutionCode = '';
  retryAction = null;
  const retryButton = document.getElementById('sb-retry-btn');
  if (retryButton) retryButton.hidden = true;
  setPanelStatus('Visible panel cleared. Saved conversation history was kept.');
  document.getElementById('sb-chat').replaceChildren();
  document.getElementById('sb-thought-input').value = '';
  const section = document.getElementById('sb-solution-section');
  section.style.display = 'none'; section.classList.remove('sb-solution-unlocked');
  const button = document.getElementById('sb-solution-btn');
  button.disabled = false; button.textContent = '\u{1f513} Show Complete Solution'; button.style.opacity = '';
  document.getElementById('sb-progress-fill').style.background = '';
  showLoading(false);
  updateProgress();
}
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id) return;
    if (request?.action === 'clearHistory') { clearConversation(); sendResponse({ success: true }); }
    if (request?.action === 'authChanged') {
      clearConversation();
      // Worker recovery returns no tokens; the version guards stale results.
      refreshPanelAuth();
      sendResponse({ success: true });
    }
    if (['newConversation', 'deleteConversation'].includes(request?.action)) {
      resetSavedConversation(request.action).then(sendResponse);
      return true;
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
