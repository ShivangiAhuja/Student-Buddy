// content.js - Injected into LeetCode pages

let mentorPanel = null;
let conversationHistory = [];
let currentProblem = null;

// Initialize the extension
function init() {
  extractProblemInfo();
  createMentorPanel();
  setupMessageListener();
}

// Extract problem details from the page
function extractProblemInfo() {
  const titleElement = document.querySelector('[data-cy="question-title"]') || 
                       document.querySelector('.text-title-large');
  const descElement = document.querySelector('[data-track-load="description_content"]') ||
                      document.querySelector('.elfjS');
  
  currentProblem = {
    title: titleElement?.innerText || 'Unknown Problem',
    description: descElement?.innerText?.substring(0, 500) || 'No description found'
  };
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
  
  const icon = role === 'user' ? '👤' : role === 'mentor' ? '🎓' : '⚠️';
  
  msgDiv.innerHTML = `
    <div class="sb-message-icon">${icon}</div>
    <div class="sb-message-content">${formatMessage(message)}</div>
  `;
  
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

function formatMessage(text) {
  // Basic markdown-like formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function showLoading(show) {
  document.getElementById('sb-loading').style.display = show ? 'flex' : 'none';
}

function setupMessageListener() {
  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'clearHistory') {
      conversationHistory = [];
      document.getElementById('sb-chat').innerHTML = '';
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