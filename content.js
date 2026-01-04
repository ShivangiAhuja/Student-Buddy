// content.js - Injected into LeetCode pages

let mentorPanel = null;
let conversationHistory = [];
let currentProblem = null;
let hintsUsed = 0;
let solutionUnlocked = false;
let preferredLanguage = 'Python'; // Default

// Initialize the extension
function init() {
  extractProblemInfo();
  detectLanguage();
  startLanguageMonitoring(); // Monitor for language changes
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
  
  console.log('Problem extracted:', currentProblem);
  
  return currentProblem;
}

// Detect the programming language the user is using
function detectLanguage() {
  console.log('🔍 Starting language detection...');
  
  // Method 1: Check the actual code editor language via data attributes
  try {
    // Look for language indicators in multiple places
    const editors = document.querySelectorAll('.monaco-editor, [class*="editor"]');
    
    for (const editor of editors) {
      // Check data-mode-id attribute
      const modeId = editor.getAttribute('data-mode-id') || 
                     editor.getAttribute('data-language') ||
                     editor.querySelector('[data-mode-id]')?.getAttribute('data-mode-id');
      
      if (modeId) {
        console.log('Found data-mode-id:', modeId);
        
        const langMap = {
          'cpp': 'C++',
          'c': 'C',
          'java': 'Java',
          'python': 'Python',
          'javascript': 'JavaScript',
          'typescript': 'TypeScript',
          'csharp': 'C#',
          'go': 'Go',
          'golang': 'Go',
          'ruby': 'Ruby',
          'swift': 'Swift',
          'kotlin': 'Kotlin',
          'rust': 'Rust',
          'php': 'PHP',
          'scala': 'Scala'
        };
        
        if (langMap[modeId.toLowerCase()]) {
          preferredLanguage = langMap[modeId.toLowerCase()];
          console.log('✅ Detected from Monaco:', preferredLanguage);
          return;
        }
      }
    }
  } catch (e) {
    console.log('Monaco detection error:', e);
  }
  
  // Method 2: Check the language selector button (improved selectors)
  try {
    // Try all possible button selectors
    const selectors = [
      'button[id*="headlessui-listbox-button"]',
      'button[class*="rounded"][class*="items-center"]',
      'div[class*="text-sm"] button',
      '.text-label-2.dark\\:text-dark-label-2',
      '[class*="language"] button'
    ];
    
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        const text = (button.innerText || button.textContent || '').trim();
        console.log(`Checking button (${selector}):`, text);
        
        // Direct matching with the exact text shown
        if (text === 'C++' || text.includes('C++')) {
          preferredLanguage = 'C++';
          console.log('✅ Detected C++ from button');
          return;
        } else if (text === 'C' && !text.includes('++') && !text.includes('#')) {
          preferredLanguage = 'C';
          console.log('✅ Detected C from button');
          return;
        } else if (text.includes('Java') && !text.includes('JavaScript')) {
          preferredLanguage = 'Java';
          console.log('✅ Detected Java from button');
          return;
        } else if (text.includes('Python')) {
          preferredLanguage = 'Python';
          console.log('✅ Detected Python from button');
          return;
        } else if (text.includes('JavaScript') || text === 'JS') {
          preferredLanguage = 'JavaScript';
          console.log('✅ Detected JavaScript from button');
          return;
        } else if (text.includes('TypeScript') || text === 'TS') {
          preferredLanguage = 'TypeScript';
          console.log('✅ Detected TypeScript from button');
          return;
        } else if (text.includes('C#')) {
          preferredLanguage = 'C#';
          console.log('✅ Detected C# from button');
          return;
        } else if (text === 'Go' || text.includes('Golang')) {
          preferredLanguage = 'Go';
          console.log('✅ Detected Go from button');
          return;
        }
      }
    }
  } catch (e) {
    console.log('Button detection error:', e);
  }
  
  // Method 3: Analyze the actual code in the editor
  try {
    let codeText = '';
    
    // Try to get code from various editor implementations
    const codeElements = document.querySelectorAll('.view-line, .view-lines span, [class*="code-line"]');
    
    for (let i = 0; i < Math.min(10, codeElements.length); i++) {
      codeText += (codeElements[i].innerText || codeElements[i].textContent || '') + '\n';
    }
    
    console.log('Code sample (first 200 chars):', codeText.substring(0, 200));
    
    // C++ detection patterns (very specific)
    if (codeText.includes('vector<') || 
        codeText.includes('#include') || 
        codeText.includes('std::') ||
        codeText.includes('unordered_map') ||
        codeText.includes('public:') ||
        codeText.match(/class\s+\w+\s*\{[\s\S]*public:/)) {
      preferredLanguage = 'C++';
      console.log('✅ Detected C++ from code patterns');
      return;
    }
    
    // Java detection patterns
    if (codeText.includes('public class') || 
        codeText.includes('public int') ||
        codeText.includes('private ') ||
        codeText.includes('ArrayList') ||
        codeText.includes('HashMap')) {
      preferredLanguage = 'Java';
      console.log('✅ Detected Java from code patterns');
      return;
    }
    
    // Python detection patterns
    if (codeText.includes('def ') || 
        codeText.includes('class Solution:') ||
        codeText.match(/def\s+\w+\(self/) ||
        codeText.includes('List[') ||
        codeText.includes('Dict[')) {
      preferredLanguage = 'Python';
      console.log('✅ Detected Python from code patterns');
      return;
    }
    
    // JavaScript detection patterns
    if (codeText.includes('var ') || 
        codeText.includes('const ') ||
        codeText.includes('let ') ||
        codeText.includes('function(') ||
        codeText.includes('=>')) {
      preferredLanguage = 'JavaScript';
      console.log('✅ Detected JavaScript from code patterns');
      return;
    }
    
  } catch (e) {
    console.log('Code analysis error:', e);
  }
  
  console.log('⚠️ Could not detect language, defaulting to:', preferredLanguage);
}

// Re-detect language periodically (in case user changes it)
function startLanguageMonitoring() {
  // Re-detect every 3 seconds
  setInterval(() => {
    const oldLang = preferredLanguage;
    detectLanguage();
    
    if (oldLang !== preferredLanguage) {
      console.log(`🔄 Language changed: ${oldLang} → ${preferredLanguage}`);
      
      // Update badge
      const languageBadge = document.getElementById('sb-language-text');
      if (languageBadge) {
        languageBadge.textContent = preferredLanguage;
      }
    }
  }, 3000);
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
          <div class="sb-problem-title">${currentProblem.title}</div>
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
      
      <div class="sb-input-area">
        <textarea 
          id="sb-thought-input" 
          placeholder="What are you thinking? Share your approach or ask for a hint..."
          rows="3"
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
      
      <div class="sb-loading" id="sb-loading" style="display: none;">
        <div class="sb-spinner"></div>
        <span>Thinking...</span>
      </div>
    </div>
  `;
  
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
      preferredLanguage = e.target.value;
      languageBadge.textContent = preferredLanguage;
      console.log('🔄 Language manually changed to:', preferredLanguage);
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
      hintsUsed++;
      console.log('Hints used:', hintsUsed); // Debug log
      updateProgress();
      
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
    
    if (response && response.success) {
      addMessageToChat('mentor', response.message);
      conversationHistory.push({ role: 'assistant', content: response.message });
    } else {
      addMessageToChat('error', response?.error || 'Failed to get response. Check your API key in settings.');
    }
  } catch (error) {
    console.error('Message sending error:', error);
    addMessageToChat('error', `Connection error: ${error.message}. Try reloading the extension.`);
  }
  
  showLoading(false);
}

function addMessageToChat(role, message) {
  const chat = document.getElementById('sb-chat');
  const msgDiv = document.createElement('div');
  msgDiv.className = `sb-message sb-message-${role}`;
  
  const icons = {
    'user': '👤',
    'mentor': '🎓',
    'error': '⚠️',
    'solution': '💡'
  };
  
  const icon = icons[role] || '💬';
  
  msgDiv.innerHTML = `
    <div class="sb-message-icon">${icon}</div>
    <div class="sb-message-content">${formatMessage(message)}</div>
  `;
  
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

function formatMessage(text) {
  // Handle code blocks first
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Handle inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Handle bold (for highlighting important terms)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="sb-highlight">$1</strong>');
  
  // Handle italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Handle numbered lists (1. 2. 3.)
  text = text.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="sb-numbered-item"><span class="sb-number">$1</span>$2</li>');
  
  // Wrap consecutive numbered items in ol
  text = text.replace(/(<li class="sb-numbered-item">.*?<\/li>\n?)+/g, match => {
    return '<ol class="sb-numbered-list">' + match + '</ol>';
  });
  
  // Handle bullet points (• or - at start of line)
  text = text.replace(/^[•\-]\s+(.+)$/gm, '<li class="sb-bullet-item">$1</li>');
  
  // Wrap consecutive bullets in ul
  text = text.replace(/(<li class="sb-bullet-item">.*?<\/li>\n?)+/g, match => {
    return '<ul class="sb-bullet-list">' + match + '</ul>';
  });
  
  // Handle line breaks (but not inside lists)
  text = text.replace(/\n(?![<\/])/g, '<br>');
  
  return text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showLoading(show) {
  document.getElementById('sb-loading').style.display = show ? 'flex' : 'none';
}

function updateProgress() {
  console.log('updateProgress called, hintsUsed:', hintsUsed); // Debug
  
  const progressFill = document.getElementById('sb-progress-fill');
  const progressText = document.getElementById('sb-progress-text');
  const solutionSection = document.getElementById('sb-solution-section');
  
  if (!progressFill || !progressText || !solutionSection) {
    console.error('Progress elements not found!');
    return;
  }
  
  // Calculate progress (unlock after 3 hints)
  const progress = Math.min((hintsUsed / 3) * 100, 100);
  progressFill.style.width = progress + '%';
  
  console.log('Progress:', progress + '%'); // Debug
  
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
    
    console.log('Solution unlocked!'); // Debug
    
    // Animate unlock
    setTimeout(() => {
      solutionSection.classList.add('sb-solution-unlocked');
      
      // CRITICAL: Attach event listener to the now-visible button
      const solutionBtn = document.getElementById('sb-solution-btn');
      if (solutionBtn) {
        console.log('🔧 Attaching solution button listener NOW...');
        
        // Remove any existing listeners
        const newBtn = solutionBtn.cloneNode(true);
        solutionBtn.parentNode.replaceChild(newBtn, solutionBtn);
        
        // Attach fresh listener
        newBtn.addEventListener('click', (e) => {
          console.log('🔴 SOLUTION BUTTON CLICKED!');
          e.preventDefault();
          e.stopPropagation();
          showSolution();
        });
        
        console.log('✅ Solution button listener attached successfully');
      } else {
        console.error('❌ Solution button STILL not found after unlock!');
      }
    }, 100);
  }
}

async function showSolution() {
  console.log('=== SHOW SOLUTION CLICKED ===');
  
  const solutionBtn = document.getElementById('sb-solution-btn');
  
  if (!solutionBtn) {
    console.error('Solution button not found!');
    return;
  }
  
  console.log('Current problem:', currentProblem);
  
  if (!currentProblem || !currentProblem.title || currentProblem.title === 'Unknown Problem') {
    alert('Problem information not found. Please refresh the page and try again.');
    return;
  }
  
  // Confirm action
  const confirmed = confirm('Are you sure? It\'s better to keep trying with hints first. Seeing the solution now might prevent you from learning deeply.');
  
  if (!confirmed) {
    console.log('User cancelled solution request');
    return;
  }
  
  console.log('User confirmed, requesting solution...');
  
  // Disable button and show loading
  solutionBtn.disabled = true;
  solutionBtn.innerHTML = '⏳ Getting solution...';
  showLoading(true);
  
  try {
    console.log('Sending message to background script...');
    
    // Use a Promise wrapper for better error handling
          const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getSolution',
        data: {
          problem: {
            title: currentProblem.title,
            description: currentProblem.description
          },
          language: preferredLanguage // Pass detected language
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Response received:', response);
          resolve(response);
        }
      });
    });
    
    if (response && response.success) {
      console.log('✅ Solution successful! Adding to chat...');
      console.log('Solution length:', response.message?.length);
      
      addMessageToChat('solution', response.message);
      solutionBtn.innerHTML = '✅ Solution Shown';
      solutionBtn.style.opacity = '0.6';
      
      // Scroll to show solution
      setTimeout(() => {
        const content = document.getElementById('sb-content');
        if (content) {
          content.scrollTop = content.scrollHeight;
          console.log('Scrolled to bottom');
        }
      }, 100);
    } else {
      console.error('❌ Solution failed:', response?.error);
      addMessageToChat('error', response?.error || 'Failed to get solution. Check the Service Worker console.');
      solutionBtn.disabled = false;
      solutionBtn.innerHTML = '🔓 Show Complete Solution';
    }
  } catch (error) {
    console.error('❌ Exception caught:', error);
    console.error('Error stack:', error.stack);
    addMessageToChat('error', `Error: ${error.message}. Open Service Worker console (chrome://extensions) for details.`);
    solutionBtn.disabled = false;
    solutionBtn.innerHTML = '🔓 Show Complete Solution';
  }
  
  showLoading(false);
  console.log('=== SHOW SOLUTION COMPLETE ===');
}

function setupMessageListener() {
  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'clearHistory') {
      conversationHistory = [];
      hintsUsed = 0;
      solutionUnlocked = false;
      document.getElementById('sb-chat').innerHTML = '';
      document.getElementById('sb-solution-section').style.display = 'none';
      updateProgress();
      addMessageToChat('mentor', 'Conversation cleared! Ready for a fresh start? 🚀');
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}