const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../chrome-extension');

// A deliberately small DOM double: any attempt to parse HTML fails the tests.
class Node {
  constructor(tag = '#text', text = '') {
    this.tagName = tag; this.children = []; this.value = ''; this.style = {};
    this.classList = { add() {}, remove() {} }; this.text = text; this.listeners = {};
  }
  set innerHTML(_) { throw new Error('Untrusted HTML sink'); }
  set textContent(text) { this.children = []; this.text = text; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
  appendChild(n) { this.children.push(n); return n; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  replaceChildren() { this.children = []; this.text = ''; }
  querySelector(selector) { return this.children.find(n => '.' + n.className === selector) || null; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
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
  const context = vm.createContext({ document, setInterval() {}, setTimeout() {},
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } } });
  vm.runInContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);
  return { context, document, run: code => vm.runInContext(code, context), getListener: () => listener };
}
function background(fetch) {
  const context = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, TypeError,
    chrome: { runtime: { onMessage: { addListener() {} } }, storage: { sync: { get: async () => ({ apiKey: 'test-only' }) } } } });
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
  return context;
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
  let result; c.getListener()({ action: 'clearHistory' }, {}, value => { result = value; });
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
test('all three Groq flows validate success and reject malformed responses', async () => {
  for (const handler of ['handleMentorRequest', 'handleSolutionRequest', 'handleCorrectionRequest']) {
    for (const data of [{ choices: [{ message: { content: 'answer' } }] }, {}, { choices: [] }, { choices: [{ message: { content: ' ' } }] }, { choices: [{ message: { content: 42 } }] }]) {
      const c = background(async () => ({ ok: true, json: async () => data }));
      const result = await c[handler]({ problem: { title: 'Test', description: 'Test' }, hintLevel: 1 });
      assert.equal(result.success, data.choices?.[0]?.message?.content === 'answer');
    }
  }
});
test('invalid JSON, non-JSON HTTP errors, network failure, and timeout', async () => {
  for (const [fetch, expected] of [
    [async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }), /invalid JSON/],
    [async () => ({ ok: false, status: 429 }), /limit/],
    [async () => ({ ok: false, status: 502 }), /HTTP 502/],
    [async () => { throw new TypeError('secret provider detail'); }, /connection/],
    [(_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))), /timed out/]
  ]) {
    const c = background(fetch);
    await assert.rejects(c.requestGroq('test-only', {}, 10), expected);
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
});
