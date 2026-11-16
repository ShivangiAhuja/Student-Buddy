// content.js - Injected into LeetCode pages

let historyVersion = 0;
let requestInFlight = false;
let manualLanguage = false;
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
  startLanguageMonitoring();
  createMentorPanel();
  setupMessageListener();
}

// Extract problem details from the page
function extractProblemInfo() {
  // Try multiple selectors for title
  const titleElement = document.querySelector('[data-cy="question-title"]') || 
                       document.querySelector('.text-title-large') ||
                       document.querySelector('[class*="text-title"]') ||
                       document.querySelector('div[class*="title"]');
  
  // Try multiple selectors for description
  const descElement = document.querySelector('[data-track-load="description_content"]') ||
                      document.querySelector('.elfjS') ||
                      document.querySelector('[class*="description"]') ||
                      document.querySelector('.question-content');
  
  const title = titleElement?.innerText || 'Unknown Problem';
  const description = descElement?.innerText || 'No description found';
  
  currentProblem = {
    title: title,
    description: description.substring(0, 1500) // Increased from 500 to 1500
  };
  
  
  return currentProblem;
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
  panel.className = 'sb-panel sb-minimized';
  
  panel.innerHTML = `
    <div class="sb-header">
      <div class="sb-title">
        <span class="sb-icon">🎓</span>
        <span>Student Buddy</span>
      </div>
      <button class="sb-toggle" id="sb-toggle-btn" title="Minimize panel">▼</button>
    </div>
    
    <div class="sb-content" id="sb-content">
      <div class="sb-welcome">
        <div class="sb-welcome-header">
          <div class="sb-welcome-emoji">👋</div>
          <div class="sb-welcome-text">
            <h2>Hi! I'm your AI mentor.</h2>
            <p>I won't give you the solution, but I'll help guide your thinking!</p>
          </div>
        </div>
        
        <div class="sb-problem-card">
          <div class="sb-problem-label">Problem:</div>
          <div class="sb-problem-title"></div>
          <div class="sb-language-selector">
            <div class="sb-language-badge" id="sb-language-badge">
              <span class="sb-language-icon">💻</span>
              <span id="sb-language-text">Python</span>
            </div>
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
      
      <div class="sb-chat" id="sb-chat"></div>
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
      ></textarea>
      
      <div class="sb-actions">
        <div class="sb-hint-levels">
          <button class="sb-hint-btn" data-level="1">💡 First Hint</button>
          <button class="sb-hint-btn" data-level="2">🔦 Stronger Hint</button>
          <button class="sb-hint-btn" data-level="3">🎯 Direct Nudge</button>
        </div>
        <button class="sb-send-btn" id="sb-send-btn">Send Thought</button>
        
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
  
  panel.querySelector('.sb-problem-title').textContent = currentProblem.title;
  document.body.appendChild(panel);
  mentorPanel = panel;
  
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
      manualLanguage = true;
      preferredLanguage = e.target.value;
      languageBadge.textContent = preferredLanguage;
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
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY
      });
      header.dispatchEvent(mouseDownEvent);
    }
  });
  
  document.getElementById('sb-solution-btn').addEventListener('click', showSolution);
  // Send button
  document.getElementById('sb-send-btn').addEventListener('click', () => sendThought(0));
  
  // Hint level buttons
  document.querySelectorAll('.sb-hint-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
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
    if (e.target.id === 'sb-toggle-btn' || e.target.closest('#sb-toggle-btn')) {
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
  btn.title = isMinimized ? 'Expand panel' : 'Minimize panel';
}

async function sendThought(hintLevel) {
  if (requestInFlight) return;
  const version = historyVersion;
  const input = document.getElementById('sb-thought-input');
  const userThought = input.value.trim();
  
  if (!userThought && hintLevel === 0) {
    return; // Don't send empty thoughts unless it's a hint request
  }
  
  // Add user message to chat
  if (userThought) {
    addMessageToChat('user', userThought);
    conversationHistory.push({ role: 'user', content: userThought });
  }
  
  // Clear input
  input.value = '';
  
  // Show loading
  requestInFlight = true;
  showLoading(true);
  
  // Send to background script for API call
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getMentorResponse',
      data: {
        problem: currentProblem,
        userThought: userThought,
        hintLevel: hintLevel,
        history: conversationHistory
      }
    });
    
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    
    if (version !== historyVersion) return;
    if (response && response.success && typeof response.message === 'string' && response.message.trim()) {
      if (hintLevel > 0) { hintsUsed++; updateProgress(); }
      addMessageToChat('mentor', response.message);
      conversationHistory.push({ role: 'assistant', content: response.message });
    } else {
      addMessageToChat('error', response?.error || 'Failed to get response. Check your API key in settings.');
    }
  } catch (error) {
    if (version !== historyVersion) return;
    addMessageToChat('error', `Connection error: ${error.message}. Try reloading the extension.`);
  }
  
  if (version === historyVersion) { requestInFlight = false; showLoading(false); }
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
    wrongBtn.onclick = function() { requestCorrection(); };
    
    const describeBtn = document.createElement('button');
    describeBtn.className = 'sb-action-btn sb-describe-btn';
    describeBtn.textContent = '📝 Describe the Issue';
    describeBtn.onclick = function() { requestCorrectionWithDetails(); };
    
    actionDiv.appendChild(wrongBtn);
    actionDiv.appendChild(describeBtn);
    contentDiv.appendChild(actionDiv);
  }
  
  content.appendChild(messageDiv);
  const scroll = document.getElementById('sb-content');
  scroll.scrollTop = scroll.scrollHeight;
  content.scrollTop = content.scrollHeight;
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
      const button = document.createElement('button'); button.className = 'sb-copy-btn'; button.textContent = '\u{1f4cb} Copy';
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
  setTimeout(() => { button.textContent = '\u{1f4cb} Copy'; }, 2000);
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
  if (requestInFlight) return;
  const version = historyVersion;
  
  const solutionBtn = document.getElementById('sb-solution-btn');
  if (!solutionBtn) return;
  
  if (!currentProblem || !currentProblem.title || currentProblem.title === 'Unknown Problem') {
    alert('Problem information not found. Please refresh the page.');
    return;
  }
  
  const confirmed = confirm('Are you sure? It\'s better to keep trying with hints first.');
  if (!confirmed) return;
  
  solutionBtn.disabled = true;
  solutionBtn.textContent = '⏳ Getting solution...';
  requestInFlight = true;
  showLoading(true);
  
  try {
    // Re-extract code template to get latest
    extractCodeTemplate();
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getSolution',
        data: {
          problem: currentProblem,
          language: preferredLanguage,
          codeTemplate: currentCodeTemplate // Pass the template
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (version !== historyVersion) return;
    if (response && response.success && typeof response.message === 'string' && response.message.trim()) {
      lastSolutionCode = response.message; // Store for potential correction
      addMessageToChat('solution', response.message, true); // true = add correction buttons
      solutionBtn.textContent = '✅ Solution Shown';
      solutionBtn.style.opacity = '0.6';
      
      setTimeout(() => {
        const contentEl = document.getElementById('sb-content');
        if (contentEl) {
          contentEl.scrollTop = contentEl.scrollHeight;
        }
      }, 100);
    } else {
      addMessageToChat('error', response?.error || 'Failed to get solution');
      solutionBtn.disabled = false;
      solutionBtn.textContent = 'Show Complete Solution';
    }
  } catch (error) {
    if (version !== historyVersion) return;
    addMessageToChat('error', `Error: ${error.message}`);
    solutionBtn.disabled = false;
    solutionBtn.textContent = 'Show Complete Solution';
  }
  
  if (version === historyVersion) { requestInFlight = false; showLoading(false); }
}

// NEW: Request corrected solution
async function requestCorrection(errorMessage = '') {
  if (requestInFlight) return;
  const version = historyVersion;
  
  requestInFlight = true;
  showLoading(true);
  
  // Add user feedback to chat
  if (errorMessage) {
    addMessageToChat('user', `The previous solution is incorrect. ${errorMessage}`);
  } else {
    addMessageToChat('user', 'The previous solution is incorrect. Please provide a corrected solution.');
  }
  
  try {
    extractCodeTemplate(); // Get latest template
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'correctSolution',
        data: {
          problem: currentProblem,
          language: preferredLanguage,
          previousSolution: lastSolutionCode,
          errorMessage: errorMessage,
          codeTemplate: currentCodeTemplate
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (version !== historyVersion) return;
    if (response && response.success && typeof response.message === 'string' && response.message.trim()) {
      lastSolutionCode = response.message; // Update with corrected solution
      addMessageToChat('solution', response.message, true); // Add with correction buttons
      
      setTimeout(() => {
        const contentEl = document.getElementById('sb-content');
        if (contentEl) {
          contentEl.scrollTop = contentEl.scrollHeight;
        }
      }, 100);
    } else {
      addMessageToChat('error', response?.error || 'Failed to get correction');
    }
  } catch (error) {
    if (version !== historyVersion) return;
    addMessageToChat('error', `Error: ${error.message}`);
  }
  
  if (version === historyVersion) { requestInFlight = false; showLoading(false); }
}

// NEW: Request correction with custom error description
function requestCorrectionWithDetails() {
  const errorDesc = prompt('Please describe what\'s wrong with the solution (e.g., "fails for edge case", "wrong output for example 2"):');
  if (errorDesc) {
    requestCorrection(errorDesc);
  }
}



function clearConversation() {
  historyVersion++;
  requestInFlight = false;
  conversationHistory = [];
  hintsUsed = 0;
  solutionUnlocked = false;
  lastSolutionCode = '';
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
    if (request?.action === 'clearHistory') {
      clearConversation();
      sendResponse({ success: true });
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
