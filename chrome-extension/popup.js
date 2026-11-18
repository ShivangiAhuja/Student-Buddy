let registrationMode = false;
let busy = false;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authForm').addEventListener('submit', submitAuthentication);
  document.getElementById('modeBtn').addEventListener('click', toggleMode);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('newConversationBtn').addEventListener('click', () => panelAction('newConversation'));
  document.getElementById('deleteConversationBtn').addEventListener('click', () => {
    if (confirm('Permanently delete the current saved conversation and its messages?')) panelAction('deleteConversation');
  });
  loadSettings();
  chrome.runtime.onMessage?.addListener(message => { if (message?.action === 'authChanged') loadSettings(); });
});
function showStatus(message, type = 'error') {
  const element = document.getElementById('status');
  element.textContent = message;
  element.className = `status ${type}`;
  element.style.display = 'block';
}
async function command(action, data) {
  let result;
  try { result = await chrome.runtime.sendMessage({ action, ...(data ? { data } : {}) }); }
  catch { throw new Error('Extension worker unavailable. Reload the extension.'); }
  if (!result?.success) throw new Error(result?.error || 'Could not complete this action.');
  return result;
}
function renderAccount(user) {
  document.getElementById('signedOut').hidden = !!user;
  document.getElementById('signedIn').hidden = !user;
  document.getElementById('accountName').textContent = user ? `Signed in as ${user.username}` : '';
}
async function loadSettings() {
  try {
    const result = await command('authState');
    renderAccount(result.user);
    document.getElementById('backendLabel').textContent = result.backendOrigin;
  } catch (error) { renderAccount(null); showStatus(error.message); }
}
function toggleMode() {
  registrationMode = !registrationMode;
  document.getElementById('emailGroup').hidden = !registrationMode;
  document.getElementById('confirmationGroup').hidden = !registrationMode;
  document.getElementById('email').required = registrationMode;
  document.getElementById('confirmation').required = registrationMode;
  document.getElementById('authHeading').textContent = registrationMode ? 'Create your account' : 'Welcome back';
  document.getElementById('submitBtn').textContent = registrationMode ? 'Register' : 'Log in';
  document.getElementById('modeBtn').textContent = registrationMode ? 'Already have an account? Log in' : 'Create an account';
  document.getElementById('password').autocomplete = registrationMode ? 'new-password' : 'current-password';
  document.getElementById('password').value = '';
  document.getElementById('confirmation').value = '';
}
async function submitAuthentication(event) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  document.getElementById('submitBtn').disabled = true;
  const data = { username: document.getElementById('username').value.trim(), password: document.getElementById('password').value };
  if (registrationMode) { data.email = document.getElementById('email').value.trim(); data.password_confirmation = document.getElementById('confirmation').value; }
  // Clear fields immediately; credentials only live in this request's memory.
  document.getElementById('password').value = '';
  document.getElementById('confirmation').value = '';
  try {
    if (registrationMode) {
      await command('register', data);
      toggleMode();
      showStatus('Account created. Log in to begin.', 'success');
    } else {
      const result = await command('login', data);
      renderAccount(result.user);
      showStatus('Logged in. Open a LeetCode problem to begin.', 'success');
    }
  } catch (error) { showStatus(error.message); }
  finally { data.password = ''; if ('password_confirmation' in data) data.password_confirmation = ''; busy = false; document.getElementById('submitBtn').disabled = false; }
}
async function logout() {
  if (busy) return;
  busy = true;
  renderAccount(null);
  try {
    const result = await command('logout');
    if (!result.storageCleared) throw new Error('Could not clear extension session storage. Disable the extension and clear its storage before using a shared browser.');
    showStatus(result.revoked ? 'Logged out.' : 'Signed out locally. Server revocation could not be confirmed; tokens expire normally.', result.revoked ? 'success' : 'error');
  } catch (error) { showStatus(error.message); }
  finally { busy = false; }
}
async function panelAction(action) {
  const controls = ['clearHistoryBtn', 'newConversationBtn', 'deleteConversationBtn'].map(id => document.getElementById(id));
  controls.forEach(button => { button.disabled = true; });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(www\.)?leetcode\.com\/problems\//.test(tab.url || '')) throw new Error('Open a LeetCode problem page first.');
    const result = await chrome.tabs.sendMessage(tab.id, { action });
    if (!result?.success) throw new Error(result?.error || 'The panel did not acknowledge this action. Refresh the problem page.');
    showStatus(action === 'clearHistory' ? 'Visible panel cleared. Saved history was kept.' : action === 'newConversation' ? 'A new conversation will start with your next request.' : result.deleted ? 'Saved conversation deleted.' : 'There is no saved conversation to delete.', 'success');
  } catch (error) { showStatus(error.message || 'Could not update the panel. Refresh the problem page.'); }
  finally { controls.forEach(button => { button.disabled = false; }); }
}
function clearHistory() { return panelAction('clearHistory'); }
