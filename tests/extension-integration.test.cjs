const { test } = require('node:test');
const assert = require('node:assert/strict');
const { worker, jwt, auth, response, problem, turn, completion, origin } = require('./worker-harness.cjs');

test('registration and login use backend schemas and return no tokens to popup', async () => {
  const h = worker({ storedAuth: null, handler: async call => {
    if (call.url.endsWith('/register/')) return response(201, { id: 1, username: 'alice', email: 'alice@example.com' });
    if (call.url.endsWith('/login/')) return response(200, { access: jwt(), refresh: 'rotatable-secret' });
    if (call.url.endsWith('/profile/')) return response(200, { id: 1, username: 'alice', email: 'alice@example.com' });
  } });
  await h.ready;
  const credentials = { username: 'alice', email: 'alice@example.com', password: 'test-password', password_confirmation: 'test-password' };
  assert.equal((await h.dispatch({ action: 'register', data: credentials })).registered, true);
  const result = await h.dispatch({ action: 'login', data: { username: 'alice', password: 'test-password' } });
  assert.equal(result.user.username, 'alice');
  assert.ok(!JSON.stringify(result).includes('rotatable-secret'));
  assert.equal(h.state.session.sbAuth.refresh, 'rotatable-secret');
  assert.ok(!JSON.stringify(h.state).includes('test-password'));
  assert.equal(h.calls[0].headers.Authorization, undefined);
  assert.equal(h.calls[0].credentials, 'omit');
  assert.equal(h.calls[0].redirect, 'error');
});

test('wrong login and duplicate/weak registration have sanitized errors', async () => {
  const h = worker({ storedAuth: null, handler: async call => response(call.url.endsWith('/login/') ? 401 : 400, { detail: 'internal-sensitive-body' }) });
  await h.ready;
  const login = await h.dispatch({ action: 'login', data: { username: 'alice', password: 'wrong' } });
  assert.equal(login.code, 'credentials');
  const registration = await h.dispatch({ action: 'register', data: { username: 'alice', email: 'a@b.test', password: 'weak', password_confirmation: 'weak' } });
  assert.equal(registration.code, 'registration');
  assert.ok(!JSON.stringify([login, registration]).includes('internal-sensitive-body'));
});

test('expired access rotates once for concurrent requests and persists latest refresh', async () => {
  const stored = { ...auth(), access: jwt(1) };
  let refreshes = 0;
  const h = worker({ storedAuth: stored, handler: async call => {
    if (call.url.endsWith('/refresh/')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 5)); return response(200, { access: jwt(), refresh: 'rotated-secret' }); }
    return response(200, { id: 1, username: 'alice' });
  } });
  await h.ready;
  await Promise.all([h.api.request('/api/auth/profile/'), h.api.request('/api/auth/profile/')]);
  assert.equal(refreshes, 1);
  assert.equal(h.state.session.sbAuth.refresh, 'rotated-secret');
  const restarted = worker({ stores: h.state, handler: async () => response(200, { id: 1, username: 'alice' }) });
  await restarted.ready;
  assert.equal((await restarted.api.state()).user.username, 'alice');
});

test('server-rejected access retries once after rotation with the same body', async () => {
  let attempts = 0;
  const h = worker({ handler: async call => {
    if (call.url.endsWith('/refresh/')) return response(200, { access: jwt(), refresh: 'new-refresh' });
    attempts++;
    return attempts === 1 ? response(401, {}) : completion(call);
  } });
  await h.ready;
  await h.mentor.turn(turn());
  const actions = h.calls.filter(call => call.url.endsWith('/hints/'));
  assert.equal(actions.length, 2);
  assert.equal(actions[0].body, actions[1].body);
});

test('invalid or ambiguous refresh clears authentication without exposing tokens', async () => {
  for (const offline of [false, true]) {
    const h = worker({ storedAuth: { ...auth(), access: jwt(1) }, handler: async () => {
      if (offline) throw new TypeError('raw-secret-transport');
      return response(401, { refresh: 'bad' });
    } });
    await h.ready;
    await assert.rejects(h.api.request('/api/auth/profile/'), /expired/);
    assert.equal(h.state.session.sbAuth, undefined);
  }
});

test('logout waits for rotation and revokes latest token, then clears local session', async () => {
  const h = worker({ storedAuth: { ...auth(), access: jwt(1) }, handler: async call => {
    if (call.url.endsWith('/refresh/')) return response(200, { access: jwt(), refresh: 'latest-refresh' });
    if (call.url.endsWith('/logout/')) return response(204);
    return response(200, { id: 1, username: 'alice' });
  } });
  await h.ready;
  const result = await h.api.logout();
  assert.equal(result.revoked, true);
  assert.equal(result.storageCleared, true);
  assert.equal(h.calls.find(call => call.url.endsWith('/logout/')).json.refresh, 'latest-refresh');
  assert.equal(h.state.session.sbAuth, undefined);
  await assert.rejects(h.mentor.turn(turn()), /Log in/);
});

test('offline logout still clears local tokens and warns revocation is unconfirmed', async () => {
  const h = worker({ handler: async () => { throw new TypeError('offline'); } });
  await h.ready;
  const result = await h.api.logout();
  assert.equal(result.revoked, false);
  assert.equal(result.storageCleared, true);
  assert.equal(h.state.session.sbAuth, undefined);
});

test('unauthenticated AI sends no network requests', async () => {
  const h = worker({ storedAuth: null }); await h.ready;
  await assert.rejects(h.mentor.turn(turn()), /Log in/);
  assert.equal(h.calls.length, 0);
});

test('legacy keys are deleted, storage restricted, and migration failures fail closed', async () => {
  const stores = { session: {}, local: { apiKey: 'legacy-secret' }, sync: { apiKey: 'legacy-secret' } };
  const h = worker({ stores }); await h.ready;
  assert.ok(!JSON.stringify(stores).includes('legacy-secret'));
  assert.equal(h.accessLevels.length, 2);
  assert.ok(h.accessLevels.every(([, level]) => level === 'TRUSTED_CONTEXTS'));
  assert.equal(h.calls.length, 0);
  const bad = worker({ failMigration: true });
  await assert.rejects(bad.ready, /storage/);
  assert.equal((await bad.dispatch({ action: 'authState' })).code, 'migration');
});

test('message boundary rejects external senders, frames, arbitrary URLs, tokens, and popup actions from content', async () => {
  const h = worker(); await h.ready;
  for (const [request, sender] of [
    [{ action: 'authState' }, { ...h.popup, id: 'evil' }],
    [{ action: 'login', data: { username: 'a', password: 'b' } }, h.content],
    [{ action: 'mentorTurn', data: turn() }, { ...h.content, frameId: 1 }],
    [{ action: 'mentorTurn', data: turn() }, { ...h.content, url: 'https://leetcode.com.evil.test/problems/two-sum/' }],
    [{ action: 'mentorTurn', data: { ...turn(), token: 'forged' } }, h.content],
    [{ action: 'mentorTurn', data: turn({ problem: { ...problem, url: 'https://evil.test/' } }) }, h.content],
    [{ action: 'fetch', data: { url: 'https://evil.test' } }, h.popup]
  ]) assert.equal((await h.dispatch(request, sender)).success, false);
  assert.equal(h.calls.length, 0);
});

test('four hint levels and complete solution map to hints API; debug, explain, correction map to chat', async () => {
  const h = worker({ handler: async call => completion(call) }); await h.ready;
  for (const level of [1, 2, 3, 4]) {
    const result = await h.dispatch({ action: 'mentorTurn', data: turn({ hintLevel: level }) }, h.content);
    assert.equal(result.success, true);
    assert.equal(h.calls.at(-1).json.hint_level, level);
    assert.ok(h.calls.at(-1).url.endsWith('/api/hints/'));
  }
  await h.mentor.turn(turn({ kind: 'solution' }));
  assert.equal(h.calls.at(-1).json.hint_level, 4);
  for (const kind of ['discuss', 'debug', 'explain', 'correction']) {
    await h.mentor.turn(turn({ kind }));
    assert.equal(h.calls.at(-1).json.action, kind === 'correction' ? 'solution' : kind);
    assert.ok(h.calls.at(-1).url.endsWith('/api/chat/'));
  }
  assert.ok(h.calls.every(call => call.url.startsWith(origin) && !call.url.includes('groq')));
});

test('conversation IDs persist and are reused after worker restart; history is recovered in order', async () => {
  const h = worker({ handler: async call => completion(call, 21) }); await h.ready;
  await h.mentor.turn(turn());
  assert.equal(h.calls[0].json.problem.url, problem.url);
  assert.equal(h.calls[0].json.problem.statement, problem.description);
  const restarted = worker({ stores: h.state, handler: async call => call.method === 'GET' ? response(200, {
    id: 21, language: 'Python', problem: { url: problem.url }, messages: [
      { role: 'user', content: 'Thought', sequence: 1 }, { role: 'assistant', content: 'Hint', sequence: 2 }
    ], messages_truncated: false
  }) : completion(call, 21) }); await restarted.ready;
  const recovered = await restarted.mentor.recover(turn());
  assert.equal(recovered.messages[0].role, 'user');
  await restarted.mentor.turn(turn({ hintLevel: 2 }));
  assert.equal(restarted.calls.at(-1).json.conversation_id, 21);
  assert.equal(restarted.calls.at(-1).json.problem, undefined);
});

test('ambiguous retries preserve exact UUID/body across worker restarts; new actions get fresh UUIDs', async () => {
  const first = worker({ handler: async () => { throw new TypeError('offline'); } }); await first.ready;
  await assert.rejects(first.mentor.turn(turn()), /unavailable/);
  const body = first.calls[0].body;
  const next = worker({ stores: first.state, handler: async call => completion(call) }); await next.ready;
  await assert.rejects(next.mentor.turn(turn({ userThought: 'different' })), /running/);
  await next.mentor.turn(turn());
  assert.equal(next.calls[0].body, body);
  await next.mentor.turn(turn());
  assert.notEqual(next.calls[1].json.request_id, next.calls[0].json.request_id);
});

test('backend quota, provider failure, concurrency, and malformed responses use sanitized UI errors', async () => {
  for (const [status, data, code] of [
    [429, { code: 'quota_exceeded' }, 'quota_exceeded'], [504, { code: 'provider_timeout' }, 'provider_timeout'],
    [502, { detail: 'secret traceback' }, 'provider_unavailable'], [409, { code: 'in_progress' }, 'in_progress'],
    [400, { password: 'secret traceback' }, 'invalid'], [200, {}, 'invalid_response']
  ]) {
    const h = worker({ handler: async () => response(status, data) }); await h.ready;
    const result = await h.dispatch({ action: 'mentorTurn', data: turn() }, h.content);
    assert.equal(result.code, code);
    assert.ok(!JSON.stringify(result).includes('secret traceback'));
  }
});

test('missing conversations recover to empty without deleting server data', async () => {
  const h = worker({ handler: async call => call.method === 'GET' ? response(404, {}) : completion(call) }); await h.ready;
  await h.mentor.turn(turn());
  const result = await h.mentor.recover(turn());
  assert.equal(result.missing, true);
  assert.equal(result.conversationId, null);
  assert.ok(!h.calls.some(call => call.method === 'DELETE'));
});

test('problem and language switches use separate conversation mappings', async () => {
  const h = worker({ handler: async call => completion(call, call.json.language === 'Java' ? 12 : call.json.problem?.url.includes('reverse-string') ? 13 : 11) }); await h.ready;
  await h.mentor.turn(turn());
  await h.mentor.turn(turn({ language: 'Java' }));
  await h.mentor.turn(turn({ problem: { ...problem, url: 'https://leetcode.com/problems/reverse-string/' } }));
  assert.equal(h.calls[1].json.conversation_id, undefined);
  assert.equal(h.calls[2].json.conversation_id, undefined);
  await h.mentor.turn(turn());
  assert.equal(h.calls[3].json.conversation_id, 11);
});

test('user switching cannot reuse another user conversation or pending draft', async () => {
  const h = worker({ handler: async call => {
    if (call.url.endsWith('/logout/')) return response(204);
    if (call.url.endsWith('/login/')) return response(200, { access: jwt(), refresh: 'bob-refresh' });
    if (call.url.endsWith('/profile/')) return response(200, { id: 2, username: 'bob' });
    return completion(call);
  } }); await h.ready;
  await h.mentor.turn(turn());
  await h.api.logout();
  await h.api.login({ username: 'bob', password: 'test' });
  await h.mentor.turn(turn());
  assert.equal(h.calls.at(-1).json.conversation_id, undefined);
});

test('logout and new-conversation boundaries discard late mentor responses', async () => {
  for (const logout of [false, true]) {
    let release;
    const h = worker({ handler: async call => call.url.endsWith('/logout/') ? response(204) : new Promise(resolve => { release = () => resolve(completion(call)); }) }); await h.ready;
    const pending = h.mentor.turn(turn());
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    if (logout) await h.api.logout(); else await h.mentor.reset(turn());
    release();
    await assert.rejects(pending, /changed/);
    assert.ok(Object.values(h.state.local).every(record => record.id === null));
  }
});

test('explicit delete calls DELETE; starting new preserves server history', async () => {
  const h = worker({ handler: async call => call.method === 'DELETE' ? response(204) : completion(call) }); await h.ready;
  await h.mentor.turn(turn());
  await h.mentor.reset(turn());
  assert.equal(h.calls.filter(call => call.method === 'DELETE').length, 0);
  await h.mentor.turn(turn());
  await h.mentor.reset(turn(), true);
  assert.equal(h.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('two overlapping mentor turns do not issue duplicate provider requests', async () => {
  let release;
  const h = worker({ handler: call => new Promise(resolve => { release = () => resolve(completion(call)); }) }); await h.ready;
  const pending = h.mentor.turn(turn());
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(h.mentor.turn(turn()), /running/);
  release(); await pending;
  assert.equal(h.calls.length, 1);
});

test('uncertain drafts can be recovered after page reload and changed drafts resume the original action', async () => {
  const first = worker({ handler: async () => { throw new TypeError('offline'); } }); await first.ready;
  await assert.rejects(first.mentor.turn(turn()), /unavailable/);
  const next = worker({ stores: first.state, handler: async call => completion(call) }); await next.ready;
  const recovered = await next.mentor.recover(turn());
  assert.equal(recovered.pendingAction.userThought, 'A hashmap?');
  const rejected = await next.dispatch({ action: 'mentorTurn', data: turn({ userThought: 'Changed draft' }) }, next.content);
  assert.equal(rejected.code, 'in_progress');
  assert.equal(rejected.resumeAction.userThought, 'A hashmap?');
  await next.mentor.turn(turn(recovered.pendingAction));
  assert.equal(next.calls[0].body, first.calls[0].body);
});

test('a mapping storage failure after success keeps the original request for a safe replay', async () => {
  const h = worker({ handler: async call => completion(call) }); await h.ready;
  const save = h.chrome.storage.local.set;
  let block = true;
  h.chrome.storage.local.set = async values => {
    if (block && Object.values(values).some(record => record.id)) throw new Error('storage full');
    return save(values);
  };
  await assert.rejects(h.mentor.turn(turn()), /retry storage/);
  assert.ok(Object.keys(h.state.session).some(key => key.startsWith('sbPending:')));
  block = false;
  await h.mentor.turn(turn());
  assert.equal(h.calls[0].body, h.calls[1].body);
});

test('a late refresh cannot restore an earlier login after account switching', async () => {
  let release;
  const h = worker({ storedAuth: { ...auth(), access: jwt(1) }, handler: async call => {
    if (call.url.endsWith('/refresh/')) return new Promise(resolve => { release = () => resolve(response(200, { access: jwt(), refresh: 'old-user-refresh' })); });
    if (call.url.endsWith('/login/')) return response(200, { access: jwt(), refresh: 'bob-refresh' });
    return response(200, { id: 2, username: 'bob' });
  } }); await h.ready;
  const pending = h.api.request('/api/auth/profile/');
  const rejected = assert.rejects(pending, /changed/);
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  await h.api.login({ username: 'bob', password: 'test' });
  release(); await rejected;
  assert.equal(h.state.session.sbAuth.user.username, 'bob');
  assert.equal(h.state.session.sbAuth.refresh, 'bob-refresh');
});

test('backend configuration changes invalidate stored tokens', async () => {
  const h = worker({ storedAuth: { ...auth(), backendOrigin: 'https://previous.example' } });
  await h.ready;
  await assert.rejects(h.mentor.turn(turn()), /Log in/);
  assert.equal(h.state.session.sbAuth, undefined);
  assert.equal(h.calls.length, 0);
});

test('provider failure retains the backend-created empty conversation for the next logical turn', async () => {
  let failing = true;
  const h = worker({ handler: async call => failing ? response(504, { code: 'provider_timeout', conversation_id: 42 }) : completion(call, 42) }); await h.ready;
  await assert.rejects(h.mentor.turn(turn()), /timed out/);
  failing = false;
  await h.mentor.turn(turn());
  assert.equal(h.calls[1].json.conversation_id, 42);
  assert.notEqual(h.calls[0].json.request_id, h.calls[1].json.request_id);
});

test('delete cannot falsely claim to delete an unknown pending conversation', async () => {
  const h = worker({ handler: async () => { throw new TypeError('offline'); } }); await h.ready;
  await assert.rejects(h.mentor.turn(turn()), /unavailable/);
  await assert.rejects(h.mentor.reset(turn(), true), /running/);
  assert.ok(Object.keys(h.state.session).some(key => key.startsWith('sbPending:')));
});

test('panel auth entry opens only the fixed extension account page without credentials', async () => {
  const h = worker({ storedAuth: null }); await h.ready;
  const opened = await h.dispatch({ action: 'openAuth' }, h.content);
  assert.equal(opened.opened, true);
  assert.equal(h.openedTabs[0].url, h.chrome.runtime.getURL('auth.html'));
  assert.equal(h.calls.length, 0);
  assert.equal((await h.dispatch({ action: 'openAuth' }, { ...h.content, url: 'https://evil.test/' })).success, false);
  assert.equal((await h.dispatch({ action: 'login', data: { username: 'a', password: 'b' } }, h.content)).success, false);
});

test('account tab reuses secure registration/login; panel sees username only and can log out', async () => {
  const h = worker({ storedAuth: null, handler: async call => {
    if (call.url.endsWith('/register/')) return response(201, { id: 1 });
    if (call.url.endsWith('/login/')) return response(200, { access: jwt(), refresh: 'private-refresh' });
    if (call.url.endsWith('/logout/')) return response(204);
    return response(200, { id: 1, username: 'alice', email: 'private@example.com' });
  } }); await h.ready;
  const accountTab = { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('auth.html'), frameId: 0, tab: { id: 7 } };
  assert.equal((await h.dispatch({ action: 'register', data: { username: 'alice', email: 'alice@example.com', password: 'test', password_confirmation: 'test' } }, accountTab)).success, true);
  assert.equal((await h.dispatch({ action: 'login', data: { username: 'alice', password: 'test' } }, accountTab)).success, true);
  const state = await h.dispatch({ action: 'panelAuthState' }, h.content);
  assert.equal(state.user.username, 'alice');
  assert.deepEqual(Object.keys(state.user), ['username']);
  assert.ok(!JSON.stringify(state).includes('private'));
  assert.equal((await h.dispatch({ action: 'panelLogout' }, h.content)).revoked, true);
  assert.equal((await h.dispatch({ action: 'panelAuthState' }, h.content)).user, null);
});
