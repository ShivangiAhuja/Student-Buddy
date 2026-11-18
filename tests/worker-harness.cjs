const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '../chrome-extension');
const origin = 'http://127.0.0.1:8000';
function jwt(exp = Math.floor(Date.now() / 1000) + 300) {
  return 'test.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.signature';
}
function auth(user = { id: 1, username: 'alice' }) {
  return { access: jwt(), refresh: 'test-refresh-one', user, epoch: 'test-epoch', backendOrigin: origin };
}
function response(status, data) { return { status, ok: status >= 200 && status < 300, json: async () => structuredClone(data) }; }
function worker({ storedAuth = auth(), stores, handler = async () => response(200, {}), timeoutMs = 28000, failMigration = false, backendOrigin = origin } = {}) {
  const state = stores || { session: storedAuth ? { sbAuth: storedAuth } : {}, local: {}, sync: {} };
  const accessLevels = [];
  const removals = [];
  const calls = [];
  const broadcasts = [];
  const openedTabs = [];
  const storage = Object.fromEntries(['session', 'local', 'sync'].map(area => [area, {
    async setAccessLevel(options) { if (failMigration) throw new Error('blocked'); accessLevels.push([area, options.accessLevel]); },
    async get(keys) {
      if (keys == null) return structuredClone(state[area]);
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter(key => key in state[area]).map(key => [key, structuredClone(state[area][key])]));
    },
    async set(data) { Object.assign(state[area], structuredClone(data)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) { removals.push([area, key]); delete state[area][key]; } }
  }]));
  let listener;
  const chrome = { storage, runtime: { id: 'test-extension', getURL: name => 'chrome-extension://test-extension/' + name,
    onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { query: async () => [], create: async options => { openedTabs.push(options); return { id: 7 }; }, sendMessage: async (id, message) => { broadcasts.push(message); } } };
  const context = vm.createContext({ chrome, URL, crypto: webcrypto, AbortController, setTimeout, clearTimeout, atob,
    fetch: async (url, options) => {
      const call = { url, ...options, json: options.body ? JSON.parse(options.body) : undefined };
      calls.push(call);
      return handler(call, calls);
    } });
  context.importScripts = (...names) => names.forEach(name => {
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
    if (name === 'config.js') {
      context.testBackendOrigin = backendOrigin;
      vm.runInContext(`StudentBuddyConfig = Object.freeze({...StudentBuddyConfig, backendOrigin: testBackendOrigin, timeoutMs: ${timeoutMs}})`, context);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
  const api = vm.runInContext('api', context);
  const mentor = vm.runInContext('mentor', context);
  const popup = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') };
  const content = { id: chrome.runtime.id, url: 'https://leetcode.com/problems/two-sum/', tab: { id: 1 }, frameId: 0 };
  return { api, mentor, chrome, context, state, calls, accessLevels, removals, broadcasts, openedTabs,
    popup, content, ready: api.ready,
    dispatch: (request, sender = popup) => new Promise(resolve => listener(request, sender, resolve)) };
}
const problem = { title: 'Two Sum', description: 'Find two indices whose numbers add to target.', url: 'https://leetcode.com/problems/two-sum/' };
function turn(changes = {}) { return { problem: { ...problem }, language: 'Python', kind: 'hint', hintLevel: 1, userThought: 'A hashmap?', code: '', ...changes }; }
function completion(call, id = 10) { return response(200, { request_id: call.json.request_id, conversation_id: id, response: 'Think about complements.' }); }
module.exports = { worker, jwt, auth, response, problem, turn, completion, origin };
