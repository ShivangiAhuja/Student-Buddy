const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../chrome-extension');
const { worker, response, turn } = require('./worker-harness.cjs');

// A deliberately small DOM double: any attempt to parse HTML fails the tests.
class Node {
  constructor(tag = '#text', text = '') {
    this.tagName = tag; this.children = []; this.value = ''; this.style = {};
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      toggle(value, force) { const enabled = force ?? !classes.has(value); if (enabled) classes.add(value); else classes.delete(value); return enabled; } };
    this.attributes = {}; this.text = text; this.listeners = {};
  }
  set innerHTML(_) { throw new Error('Untrusted HTML sink'); }
  set textContent(text) { this.children = []; this.text = text; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
  appendChild(n) { this.children.push(n); return n; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  replaceChildren() { this.children = []; this.text = ''; }
  querySelector(selector) { return this.children.find(n => '.' + n.className === selector) || null; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return { left: parseFloat(this.style.left) || 12, top: parseFloat(this.style.top) || 12, width: parseFloat(this.style.width) || 500, height: parseFloat(this.style.height) || 700 }; }
}
function content() {
  const ids = new Map(); let listener;
  const document = {
    readyState: 'loading', addEventListener() {},
    createElement: tag => new Node(tag), createTextNode: text => new Node('#text', text),
    createDocumentFragment: () => new Node('#fragment'),
    getElementById: id => { if (!ids.has(id)) ids.set(id, new Node()); return ids.get(id); },
    querySelectorAll: () => []
  };
  const context = vm.createContext({ document, URL, window: { innerWidth: 1280, innerHeight: 800 }, location: { href: 'https://leetcode.com/problems/two-sum/' }, setInterval() {}, setTimeout() {},
    chrome: { runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } } } });
  vm.runInContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);
  vm.runInContext("currentProblem = { title: 'Two Sum', description: 'Find indices.', url: 'https://leetcode.com/problems/two-sum/' }", context);
  return { context, document, run: code => vm.runInContext(code, context), getListener: () => listener };
}
function tags(node) { return [node.tagName, ...node.children.flatMap(tags)]; }

test('untrusted text and Markdown use safe nodes; code keeps indentation', () => {
  const c = content();
  const attack = '<img src=x onerror=alert(1)>';
  c.context.input = `## **${attack}**\n- \`${attack}\`\n\`\`\`c++\n  if (x < 2) {}\n\`\`\``;
  const tree = c.run('formatMessage(input)');
  assert.ok(tree.textContent.includes(attack));
  assert.ok(tree.textContent.includes('  if (x < 2) {}'));
  assert.ok(tags(tree).includes('strong')); assert.ok(tags(tree).includes('li'));
  assert.ok(tags(tree).includes('button')); assert.ok(!tags(tree).includes('img'));
  c.run("addMessageToChat('user', input)");
  assert.equal(c.document.getElementById('sb-chat').children.length, 1);
});
test('clear resets history, visible messages, solution state, and acknowledges', () => {
  const c = content();
  c.run("conversationHistory = [{role:'user',content:'old'}]; hintsUsed=3; solutionUnlocked=true; lastSolutionCode='old'; requestInFlight=true; addMessageToChat('user','old'); setupMessageListener()");
  let result; c.getListener()({ action: 'clearHistory' }, { id: 'test-extension' }, value => { result = value; });
  assert.equal(result.success, true);
  assert.equal(c.document.getElementById('sb-chat').children.length, 0);
  assert.equal(c.run('conversationHistory.length'), 0);
  assert.equal(c.run('lastSolutionCode'), '');
  assert.equal(c.run('requestInFlight || solutionUnlocked || hintsUsed > 0'), false);
  assert.equal(c.document.getElementById('sb-solution-btn').disabled, false);
  assert.equal(c.run('historyVersion'), 1);
});
test('clear ignores late replies and failures', async () => {
  for (const reject of [false, true]) {
    const c = content(); let finish;
    c.context.chrome.runtime.sendMessage = () => new Promise((resolve, fail) => { finish = reject ? fail : resolve; });
    c.document.getElementById('sb-thought-input').value = 'old';
    const pending = c.run('sendThought(1)');
    c.run('clearConversation()');
    finish(reject ? new Error('offline') : { success: true, message: 'late reply' });
    await pending;
    assert.equal(c.document.getElementById('sb-chat').children.length, 0);
    assert.equal(c.run('hintsUsed'), 0);
  }
});
test('language aliases, synchronized controls, and manual override', () => {
  const c = content();
  c.document.querySelectorAll = selector => selector.startsWith('.monaco-editor [') ? [{ getAttribute: () => 'python3' }] : [];
  c.run('detectLanguage()');
  assert.equal(c.document.getElementById('sb-language-dropdown').value, 'Python');
  assert.equal(c.document.getElementById('sb-language-text').textContent, 'Python');
  c.run("manualLanguage=true; preferredLanguage='Rust'; detectLanguage()");
  assert.equal(c.run('preferredLanguage'), 'Rust');
  assert.equal(c.run("normalizeLanguage(' C++ ')"), 'C++');
  assert.equal(c.run("normalizeLanguage('JavaScript settings')"), null);
});
test('mentor flows validate backend success and reject malformed responses', async () => {
  for (const kind of ['hint', 'solution', 'correction']) {
    for (const text of ['answer', '', ' ', 42, undefined]) {
      const h = worker({ handler: async call => response(200, { request_id: call.json.request_id, conversation_id: 1, response: text }) });
      await h.ready;
      let success = false;
      try { await h.mentor.turn(turn({ kind })); success = true; } catch {}
      assert.equal(success, text === 'answer');
    }
  }
});
test('invalid JSON, HTTP errors, network failure, and timeout are sanitized', async () => {
  for (const [handler, expected] of [
    [async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError(); } }), /unusable/],
    [async () => response(429, {}), /Too many/],
    [async () => response(502, {}), /unavailable/],
    [async () => { throw new TypeError('secret provider detail'); }, /unavailable/],
    [async call => new Promise((_, reject) => call.signal.addEventListener('abort', () => reject(new Error('abort')))), /taking too long/]
  ]) {
    const h = worker({ handler, timeoutMs: 10 }); await h.ready;
    await assert.rejects(h.api.request('/api/auth/profile/'), expected);
  }
});

test('popup requires clear acknowledgement and rejects unrelated tab URLs', async () => {
  for (const [url, acknowledgement, success] of [
    ['https://leetcode.com/problems/two-sum/', { success: true }, true],
    ['https://leetcode.com/problems/two-sum/', undefined, false],
    ['https://leetcode.com.evil.example/problems/test/', { success: true }, false],
    [undefined, { success: true }, false]
  ]) {
    const nodes = new Map();
    const context = vm.createContext({ setTimeout() {}, document: {
      addEventListener() {}, getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }
    }, chrome: { tabs: { query: async () => [{ id: 1, url }], sendMessage: async () => acknowledgement } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'), context);
    await context.clearHistory();
    assert.equal(nodes.get('status').className, success ? 'status success' : 'status error');
    assert.equal(nodes.get('clearHistoryBtn').disabled, false);
  }
});
test('code copy preserves exact text and reports clipboard failure', async () => {
  const c = content(); let copied;
  c.context.navigator = { clipboard: { writeText: async text => { copied = text; } } };
  const button = new Node('button');
  await c.context.copyCodeText('  x < 3;\n    next();', button);
  assert.equal(copied, '  x < 3;\n    next();');
  c.context.navigator.clipboard.writeText = async () => { throw new Error(); };
  // Missing fallback API deliberately simulates a failed fallback.
  await c.context.copyCodeText('text', button);
  assert.match(button.textContent, /failed/);
});
test('MV3 references exist and all icon dimensions match declarations', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  const refs = [manifest.background.service_worker, manifest.action.default_popup,
    ...manifest.content_scripts.flatMap(s => [...s.js, ...s.css]), ...Object.values(manifest.action.default_icon)];
  refs.forEach(ref => assert.ok(fs.existsSync(path.join(root, ref)), ref));
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.readUInt32BE(16), Number(size)); assert.equal(png.readUInt32BE(20), Number(size));
  }
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.equal((source.match(/\.innerHTML\s*=/g) || []).length, 1);
  assert.ok(!source.includes('${currentProblem.title}'));
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
  assert.ok(!JSON.stringify(manifest).includes('groq.com'));
  for (const file of ['background.js', 'api-client.js', 'mentor-client.js', 'popup.js', 'content.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!code.includes('api.groq.com'), file);
    assert.ok(!code.includes('storage.sync.get'), file);
  }
});

test('panel ignores late replies after auth and problem context switches', async () => {
  for (const change of ['authChanged', 'problem', 'routeBeforePolling']) {
    const c = content(); let finish;
    c.context.chrome.runtime.sendMessage = message => message.action === 'panelAuthState' ? Promise.resolve({ success: true, user: null }) : message.action === 'mentorRecover' ? Promise.resolve({ success: true, messages: [], conversationId: null }) : new Promise(resolve => { finish = resolve; });
    c.document.getElementById('sb-thought-input').value = 'old thought';
    c.run('setupMessageListener()');
    const pending = c.run('sendThought(1)');
    if (change === 'authChanged') c.getListener()({ action: 'authChanged' }, { id: 'test-extension' }, () => {});
    else if (change === 'problem') c.run("clearConversation(); currentProblem = { title: 'Other', description: 'Other text', url: 'https://leetcode.com/problems/other/' }");
    else c.context.location.href = 'https://leetcode.com/problems/other/';
    finish({ success: true, message: 'stale' });
    await pending;
    assert.equal(c.document.getElementById('sb-chat').children.length, 0);
  }
});

test('panel recovers chronological history and marks explicit solutions for correction', async () => {
  const c = content();
  c.context.chrome.runtime.sendMessage = async () => ({ success: true, conversationId: 1, messages: [
    { role: 'user', content: 'Mentor request: hint level 4\nStudent: solution', sequence: 1 },
    { role: 'assistant', content: 'Complete code and explanation', sequence: 2 }
  ] });
  await c.run('restoreConversation()');
  const rows = c.document.getElementById('sb-chat').children;
  assert.equal(rows[0].className, 'sb-message sb-message-user');
  assert.equal(rows[1].className, 'sb-message sb-message-solution');
  assert.equal(c.run('lastSolutionCode'), 'Complete code and explanation');
});

test('popup registration/login forms clear password fields and display safe account text', async () => {
  for (const register of [false, true]) {
    const nodes = new Map(); const calls = [];
    const node = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
    const context = vm.createContext({ document: { addEventListener() {}, getElementById: node },
      chrome: { runtime: { sendMessage: async message => { calls.push(message); return { success: true, user: { id: 1, username: '<img src=x>' } }; } } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'), context);
    if (register) context.toggleMode();
    node('username').value = 'alice'; node('email').value = 'alice@example.com';
    node('password').value = 'test-password'; node('confirmation').value = 'test-password';
    await context.submitAuthentication({ preventDefault() {} });
    assert.equal(calls[0].action, register ? 'register' : 'login');
    assert.equal(node('password').value, '');
    assert.equal(node('confirmation').value, '');
    if (!register) assert.equal(node('accountName').textContent, 'Signed in as <img src=x>');
  }
});

test('panel shows safe login/logout state and opens the trusted auth page', async () => {
  const c = content(); const calls = [];
  c.context.chrome.runtime.sendMessage = async message => { calls.push(message); return { success: true, opened: true }; };
  c.run('renderPanelAccount(null)');
  assert.equal(c.document.getElementById('sb-login-btn').hidden, false);
  assert.equal(c.document.getElementById('sb-logout-btn').hidden, true);
  await c.run('openAccountPage()');
  assert.equal(calls[0].action, 'openAuth');
  c.run("renderPanelAccount({ username: '<img src=x>' })");
  assert.equal(c.document.getElementById('sb-account-label').textContent, 'Signed in as <img src=x>');
  assert.equal(c.document.getElementById('sb-login-btn').hidden, true);
  await c.run('logoutFromPanel()');
  assert.equal(calls.at(-1).action, 'panelLogout');
  assert.equal(c.document.getElementById('sb-login-btn').hidden, false);
});

test('auth change refreshes panel state and restores history without refreshing LeetCode', async () => {
  const c = content();
  c.context.chrome.runtime.sendMessage = async message => message.action === 'panelAuthState' ?
    { success: true, user: { username: 'alice' } } : { success: true, messages: [], conversationId: 1 };
  c.run('setupMessageListener()');
  c.getListener()({ action: 'authChanged' }, { id: 'test-extension' }, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(c.document.getElementById('sb-account-label').textContent, 'Signed in as alice');
  assert.equal(c.document.getElementById('sb-login-btn').hidden, true);
});

test('reading mode expands within viewport, collapses to previous size, and can minimize', () => {
  const c = content();
  const panel = new Node('div'); panel.style = { width: '500px', height: '700px', left: '12px', top: '12px' };
  c.context.panelFixture = panel;
  c.run('mentorPanel = panelFixture; toggleReadingMode()');
  assert.equal(panel.classList.contains('sb-reading'), true);
  assert.equal(panel.style.height, '776px');
  assert.equal(panel.style.width, '960px');
  assert.equal(c.document.getElementById('sb-reading-btn').attributes['aria-pressed'], 'true');
  c.run('toggleReadingMode()');
  assert.equal(panel.style.height, '700px');
  assert.equal(panel.classList.contains('sb-reading'), false);
  c.run('togglePanel()');
  assert.equal(panel.classList.contains('sb-minimized'), true);
  c.run('togglePanel()');
  assert.equal(panel.classList.contains('sb-minimized'), false);
});

test('responsive panel dimensions fit small and large viewports', () => {
  const c = content();
  for (const [width, height] of [[360, 540], [540, 400], [1280, 800], [1920, 1080]]) {
    for (const expanded of [false, true]) {
      const result = c.run(`panelDimensions(${width}, ${height}, ${expanded})`);
      assert.ok(result.width <= width - 24);
      assert.ok(result.height <= height - 24);
      assert.ok(result.width > 0 && result.height > 0);
    }
  }
});

test('long responses follow new content only when the reader has not scrolled up', () => {
  const c = content();
  const chat = c.document.getElementById('sb-chat');
  chat.scrollHeight = 3000; chat.scrollTop = 200;
  c.run("followNewMessages = false; addMessageToChat('mentor', 'Long explanation. '.repeat(300))");
  assert.equal(chat.scrollTop, 200);
  assert.equal(c.document.getElementById('sb-latest-btn').hidden, false);
  c.run('followNewMessages = true; scrollToLatest()');
  assert.equal(chat.scrollTop, 3000);
  assert.equal(c.document.getElementById('sb-latest-btn').hidden, true);
});
