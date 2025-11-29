// popup.js - Handle settings UI

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('saveBtn').addEventListener('click', saveApiKey);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  
  // Allow Enter key to save
  document.getElementById('apiKey').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveApiKey();
    }
  });
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(['apiKey']);
  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
}

async function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const statusDiv = document.getElementById('status');
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  // Basic validation
  if (apiKey.length < 20) {
    showStatus('API key seems too short. Please check and try again.', 'error');
    return;
  }
  
  try {
    await chrome.storage.sync.set({ apiKey });
    showStatus('✅ API key saved successfully!', 'success');
    
    // Auto-hide success message after 3 seconds
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    showStatus('Failed to save API key. Please try again.', 'error');
  }
}

async function clearHistory() {
  const btn = document.getElementById('clearHistoryBtn');
  const originalText = btn.textContent;
  
  btn.textContent = 'Clearing...';
  btn.disabled = true;
  
  try {
    // Send message to content script to clear history
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.includes('leetcode.com')) {
      await chrome.tabs.sendMessage(tab.id, { action: 'clearHistory' });
      showStatus('✅ Conversation history cleared!', 'success');
    } else {
      showStatus('⚠️ Please open a LeetCode problem page', 'error');
    }
  } catch (error) {
    showStatus('Could not clear history. Make sure you\'re on a LeetCode page.', 'error');
  }
  
  btn.textContent = originalText;
  btn.disabled = false;
  
  setTimeout(() => {
    document.getElementById('status').style.display = 'none';
  }, 3000);
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}