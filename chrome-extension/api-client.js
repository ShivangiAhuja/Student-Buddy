(() => {
  class ApiError extends Error {
    constructor(code, status = 0) {
      const messages = {
        network: 'Backend unavailable or network disconnected. Start Django and retry.',
        timeout: 'The backend is taking too long. Retry the same request.',
        auth_required: 'Log in using Login / Register in the Student Buddy panel.',
        auth_expired: 'Your session expired. Use Login / Register to sign in again.',
        stale: 'The session changed. This response was discarded.',
        invalid: 'Invalid request. Check the fields, problem data, and message length.',
        credentials: 'Login failed. Check your username and password.',
        registration: 'Registration rejected. Check username, email, password strength, and confirmation.',
        quota_exceeded: 'Daily AI quota reached. Try again after midnight UTC.',
        rate_limit: 'Too many requests. Wait before trying again.',
        provider_timeout: 'The AI provider timed out. Try a new request later.',
        provider_rate_limit: 'The AI provider is busy. Try again later.',
        not_configured: 'AI is not configured on the backend. Contact its administrator.',
        model_unavailable: 'The backend AI model is unavailable.',
        provider_unavailable: 'The AI provider is unavailable. Try again later.',
        invalid_response: 'The backend returned an unusable response. Try again later.',
        storage_unavailable: 'The backend could not save this request. Retry the same request.',
        in_progress: 'A request is already running. Wait, then retry the same request.',
        request_conflict: 'This request conflicts with an earlier action. Start a new action.',
        request_expired: 'The previous request expired. Submit a new action.',
        context_changed: 'The saved conversation changed. Reload history and submit a new action.',
        conversation_deleted: 'The saved conversation was deleted. Start a new conversation.',
        not_found: 'Saved conversation unavailable. Reload history or start a new conversation.',
        forbidden: 'This action is not allowed.',
        migration: 'Could not secure extension storage or remove legacy credentials. Reload the extension and retry.',
        local_storage: 'Extension retry storage is unavailable. Restore storage access, then retry the same request.'
      };
      super(messages[code] || messages.invalid_response);
      this.code = code;
      this.status = status;
      this.retryable = ['network', 'timeout', 'storage_unavailable', 'local_storage', 'in_progress'].includes(code);
    }
  }

  function createAPI({ chrome, fetchImpl = fetch, config, onAuthChanged = () => {} }) {
    const origin = new URL(config.backendOrigin);
    if (origin.origin !== config.backendOrigin || origin.username || origin.password ||
        !(origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === '127.0.0.1'))) {
      throw new ApiError('invalid');
    }
    let auth = null;
    let revision = 0;
    let refreshing = null;
    let mutation = Promise.resolve();
    let loggingOut = false;
    const ready = (async () => {
      try {
        await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
        await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
        // Remove without ever reading/transmitting the legacy key.
        await Promise.all(['sync', 'local', 'session'].map(area => chrome.storage[area].remove('apiKey')));
        const stored = (await chrome.storage.session.get('sbAuth')).sbAuth;
        if (stored && typeof stored.access === 'string' && typeof stored.refresh === 'string' &&
            stored.backendOrigin === config.backendOrigin && Number.isSafeInteger(stored.user?.id) && typeof stored.user.username === 'string' && typeof stored.epoch === 'string') auth = stored;
        else await chrome.storage.session.remove('sbAuth');
      } catch { throw new ApiError('migration'); }
    })();

    async function clear() {
      const clearingRevision = ++revision;
      auth = null;
      const stored = await chrome.storage.session.get(null);
      if (revision !== clearingRevision) return;
      await chrome.storage.session.remove(['sbAuth', ...Object.keys(stored).filter(key => key.startsWith('sbPending:'))]);
      if (revision !== clearingRevision) return;
      onAuthChanged(null);
    }
    function assertEpoch(epoch) {
      if (loggingOut || !auth || auth.epoch !== epoch) throw new ApiError('stale');
    }
    function snapshot() {
      if (loggingOut || !auth) throw new ApiError('auth_required');
      return { user: { ...auth.user }, epoch: auth.epoch };
    }
    function expired(token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return !Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now() + 15000;
      } catch { return true; }
    }
    function validateTokens(data) {
      if (typeof data?.access !== 'string' || !data.access || typeof data.refresh !== 'string' || !data.refresh) throw new ApiError('invalid_response');
    }
    async function raw(path, { method = 'GET', body, token } = {}) {
      // All callers use fixed paths. Never accept URLs, redirects, cookies, or
      // credentials from a content-script message.
      if (!/^\/api\/[a-z0-9_/?=&-]+$/i.test(path) || path.includes('..')) throw new ApiError('invalid');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(config.backendOrigin + path, {
          method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        let data = null;
        if (response.status !== 204) {
          try { data = await response.json(); }
          catch { if (response.ok) throw new ApiError('invalid_response'); }
        }
        if (!response.ok) {
          const known = ['quota_exceeded', 'provider_timeout', 'provider_rate_limit', 'not_configured',
            'model_unavailable', 'provider_unavailable', 'invalid_response', 'storage_unavailable',
            'in_progress', 'request_conflict', 'request_expired', 'context_changed', 'conversation_deleted'];
          const code = known.includes(data?.code) ? data.code : ({ 400: 'invalid', 401: 'auth_expired', 403: 'forbidden',
            404: 'not_found', 409: 'in_progress', 410: 'conversation_deleted', 413: 'invalid', 429: 'rate_limit' })[response.status] || 'provider_unavailable';
          const error = new ApiError(code, response.status);
          if (Number.isSafeInteger(data?.conversation_id) && data.conversation_id > 0) error.conversationId = data.conversation_id;
          throw error;
        }
        return data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(controller.signal.aborted ? 'timeout' : 'network');
      } finally { clearTimeout(timer); }
    }
    async function rotate() {
      if (refreshing) return refreshing;
      if (!auth) throw new ApiError('auth_required');
      const before = auth;
      const task = (async () => {
        try {
          const tokens = await raw('/api/auth/refresh/', { method: 'POST', body: { refresh: before.refresh } });
          validateTokens(tokens);
          if (!auth || auth.epoch !== before.epoch) throw new ApiError('stale');
          auth = { ...before, access: tokens.access, refresh: tokens.refresh };
          await chrome.storage.session.set({ sbAuth: auth });
        } catch (error) {
          // A lost rotation response may have consumed the old refresh token.
          // Fail closed; do not keep retrying it or overwrite a newer login.
          if (auth?.epoch === before.epoch) await clear();
          if (error.code === 'stale') throw error;
          throw new ApiError('auth_expired');
        }
      })();
      refreshing = task;
      try { return await task; } finally { if (refreshing === task) refreshing = null; }
    }
    async function request(path, options = {}) {
      await ready;
      const { epoch } = snapshot();
      if (expired(auth.access)) await rotate();
      assertEpoch(epoch);
      const usedAccess = auth.access;
      try {
        const data = await raw(path, { ...options, token: usedAccess });
        assertEpoch(epoch);
        return data;
      } catch (error) {
        assertEpoch(epoch);
        if (error.status !== 401) throw error;
        if (auth.access === usedAccess) await rotate();
        assertEpoch(epoch);
        try {
          const data = await raw(path, { ...options, token: auth.access });
          assertEpoch(epoch);
          return data;
        } catch (retryError) {
          assertEpoch(epoch);
          if (retryError.status === 401) await clear();
          throw retryError;
        }
      }
    }
    function serializeMutation(work) {
      const task = mutation.then(work, work);
      mutation = task.catch(() => {});
      return task;
    }
    async function login(credentials) {
      return serializeMutation(async () => {
        await ready;
        await clear();
        const start = revision;
        let tokens;
        try { tokens = await raw('/api/auth/login/', { method: 'POST', body: credentials }); }
        catch (error) { if ([400, 401].includes(error.status)) throw new ApiError('credentials'); throw error; }
        validateTokens(tokens);
        const user = await raw('/api/auth/profile/', { token: tokens.access });
        if (!Number.isSafeInteger(user?.id) || typeof user.username !== 'string' || start !== revision) throw new ApiError('invalid_response');
        auth = { access: tokens.access, refresh: tokens.refresh, user: { id: user.id, username: user.username }, epoch: crypto.randomUUID(), backendOrigin: config.backendOrigin };
        try { await chrome.storage.session.set({ sbAuth: auth }); }
        catch { await clear(); throw new ApiError('migration'); }
        onAuthChanged(auth.user);
        return { user: { ...auth.user } };
      });
    }
    async function register(credentials) {
      await ready;
      try { await raw('/api/auth/register/', { method: 'POST', body: credentials }); }
      catch (error) { if (error.status === 400) throw new ApiError('registration'); throw error; }
      return { registered: true };
    }
    async function logout() {
      return serializeMutation(async () => {
        await ready;
        loggingOut = true;
        onAuthChanged(null);
        let old;
        let revoked = false;
        let storageCleared = false;
        try {
          if (refreshing) await refreshing;
          if (auth && expired(auth.access)) await rotate();
          old = auth;
        } catch { old = null; }
        try {
          await clear();
          storageCleared = true;
          if (old) {
            await raw('/api/auth/logout/', { method: 'POST', token: old.access, body: { refresh: old.refresh } });
            revoked = true;
          }
        } catch { /* Local sign-out is immediate even when revocation is offline. */ }
        finally { loggingOut = false; }
        return { revoked, storageCleared };
      });
    }
    async function state() {
      await ready;
      if (!auth || loggingOut) return { user: null, backendOrigin: config.backendOrigin };
      const user = await request('/api/auth/profile/');
      return { user: { id: user.id, username: user.username }, backendOrigin: config.backendOrigin };
    }
    return { ready, request, login, register, logout, state, snapshot, assertEpoch };
  }
  globalThis.StudentBuddyAPI = { createAPI, ApiError };
})();
