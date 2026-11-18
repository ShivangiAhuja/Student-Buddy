// Invoked only by Django's isolated LiveServerTestCase. No real Groq calls.
const assert = require('node:assert/strict');
const { worker, turn } = require('./worker-harness.cjs');

async function main() {
  const h = worker({ storedAuth: null, backendOrigin: process.argv[2], handler: async call => {
    const { url, json, ...options } = call;
    return fetch(url, options);
  } });
  await h.ready;
  const credentials = { username: 'contract_student', email: 'contract@example.com',
    password: 'Rain!Maple47-Algorithms', password_confirmation: 'Rain!Maple47-Algorithms' };
  assert.equal((await h.dispatch({ action: 'register', data: credentials })).success, true);
  assert.equal((await h.dispatch({ action: 'login', data: { username: credentials.username, password: credentials.password } })).success, true);
  const first = await h.mentor.turn(turn());
  assert.equal(first.message, 'Contract mentor response.');
  const second = await h.mentor.turn(turn({ hintLevel: 2 }));
  assert.equal(second.conversationId, first.conversationId);
  const restored = await h.mentor.recover(turn());
  assert.deepEqual(Array.from(restored.messages, message => message.sequence), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(restored.messages, message => message.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal((await h.api.logout()).revoked, true);
  await assert.rejects(h.mentor.turn(turn()), /Log in/);
  process.stdout.write('Extension-to-Django HTTP contract passed.\n');
}
main().catch(() => { process.stderr.write('Extension-to-Django HTTP contract failed.\n'); process.exitCode = 1; });
