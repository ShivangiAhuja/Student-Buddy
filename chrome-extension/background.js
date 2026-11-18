// Trusted worker: only this context sends JWT-authenticated backend requests.
importScripts('config.js', 'api-client.js', 'mentor-client.js');

async function broadcastAuthChange() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { action: 'authChanged' }).catch(() => {})));
  } catch { /* Closed tabs must not break authentication. */ }
}
const api = StudentBuddyAPI.createAPI({ chrome, config: StudentBuddyConfig, onAuthChanged: broadcastAuthChange });
const mentor = StudentBuddyMentor.createMentorClient({ api, chrome });
// Handle failed migration through each command, without unhandled rejections.
api.ready.catch(() => {});

function exactFields(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(key => keys.includes(key));
}
function credentials(data, register) {
  const keys = register ? ['username', 'email', 'password', 'password_confirmation'] : ['username', 'password'];
  if (!exactFields(data, keys) || keys.some(key => typeof data[key] !== 'string' || !data[key]) ||
      data.username.length > 150 || data.password.length > 128 || (register && (data.email.length > 254 || data.password_confirmation.length > 128))) {
    throw new StudentBuddyAPI.ApiError('invalid');
  }
  return Object.fromEntries(keys.map(key => [key, data[key]]));
}
async function dispatch(request, sender) {
  if (sender?.id !== chrome.runtime.id || !exactFields(request, ['action', 'data'])) throw new StudentBuddyAPI.ApiError('forbidden');
  const popup = sender.url === chrome.runtime.getURL('popup.html') && !sender.tab;
  if (popup) {
    if (request.action === 'authState') return api.state();
    if (request.action === 'login') return api.login(credentials(request.data, false));
    if (request.action === 'register') return api.register(credentials(request.data, true));
    if (request.action === 'logout') return api.logout();
    throw new StudentBuddyAPI.ApiError('forbidden');
  }
  if (!sender.tab || sender.frameId !== 0 || !['mentorRecover', 'mentorTurn', 'newConversation', 'deleteConversation'].includes(request.action)) {
    throw new StudentBuddyAPI.ApiError('forbidden');
  }
  const data = request.data;
  if (!exactFields(data, ['problem', 'language', 'kind', 'hintLevel', 'userThought', 'code']) ||
      !exactFields(data.problem, ['title', 'description', 'url']) ||
      StudentBuddyMentor.canonicalProblemURL(sender.url) !== StudentBuddyMentor.canonicalProblemURL(data.problem.url)) {
    throw new StudentBuddyAPI.ApiError('invalid');
  }
  if (request.action === 'mentorRecover') return mentor.recover(data);
  if (request.action === 'mentorTurn') return mentor.turn(data);
  return mentor.reset(data, request.action === 'deleteConversation');
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  dispatch(request, sender).then(data => sendResponse({ success: true, ...data })).catch(error => {
    const safe = error instanceof StudentBuddyAPI.ApiError ? error : new StudentBuddyAPI.ApiError('invalid_response');
    sendResponse({ success: false, error: safe.message, code: safe.code, retryable: safe.retryable,
      ...(safe.resumeAction ? { resumeAction: safe.resumeAction } : {}) });
  });
  return true;
});
