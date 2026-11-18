(() => {
  const { ApiError } = StudentBuddyAPI;
  const languages = ['Python', 'Java', 'C++', 'JavaScript', 'TypeScript', 'C', 'C#', 'Go', 'Ruby', 'Swift', 'Kotlin', 'Rust', 'PHP', 'Scala'];
  function canonicalProblemURL(value) {
    let url;
    try { url = new URL(value); } catch { throw new ApiError('invalid'); }
    const match = url.pathname.match(/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(?:description|editorial|solutions|submissions))?\/?$/i);
    if (url.protocol !== 'https:' || !['leetcode.com', 'www.leetcode.com'].includes(url.hostname) || url.port || url.username || url.password || !match) throw new ApiError('invalid');
    return `https://leetcode.com/problems/${match[1].toLowerCase()}/`;
  }
  function validateContext(data) {
    if (!data || !languages.includes(data.language) || !data.problem ||
        typeof data.problem.title !== 'string' || !data.problem.title.trim() || data.problem.title.length > 255 ||
        typeof data.problem.description !== 'string' || !data.problem.description.trim() || data.problem.description.length > 30000 ||
        ['Unknown Problem', 'No description found'].includes(data.problem.title) || data.problem.description === 'No description found') throw new ApiError('invalid');
    return { language: data.language, problem: { title: data.problem.title.trim(), description: data.problem.description,
      url: canonicalProblemURL(data.problem.url) } };
  }
  function createMentorClient({ api, chrome }) {
    const active = new Set();
    async function context(data) {
      await api.ready;
      const identity = api.snapshot();
      const normalized = validateContext(data);
      const key = 'sbConversation:' + JSON.stringify([StudentBuddyConfig.backendOrigin, identity.user.id, normalized.problem.url, normalized.language]);
      let record = (await chrome.storage.local.get(key))[key];
      api.assertEpoch(identity.epoch);
      if (!record || typeof record.generation !== 'string' || (record.id !== null && (!Number.isSafeInteger(record.id) || record.id < 1))) {
        record = { id: null, generation: crypto.randomUUID() };
        await chrome.storage.local.set({ [key]: record });
      }
      return { ...normalized, ...identity, key, record, pendingKey: 'sbPending:' + key };
    }
    async function check(ctx) {
      api.assertEpoch(ctx.epoch);
      const now = (await chrome.storage.local.get(ctx.key))[ctx.key];
      if (now?.generation !== ctx.record.generation) throw new ApiError('stale');
      return now;
    }
    function resumeAction(pending, generation) {
      if (!pending || pending.generation !== generation) return null;
      const [kind, hintLevel, userThought, code] = JSON.parse(pending.signature);
      return { kind, hintLevel, userThought, code };
    }
    async function recover(data) {
      const ctx = await context(data);
      const pending = (await chrome.storage.session.get(ctx.pendingKey))[ctx.pendingKey];
      const pendingAction = resumeAction(pending, ctx.record.generation);
      await check(ctx);
      if (!ctx.record.id) return { messages: [], conversationId: null, truncated: false, pendingAction };
      try {
        const detail = await api.request(`/api/conversations/${ctx.record.id}/`);
        await check(ctx);
        if (detail.id !== ctx.record.id || detail.language !== ctx.language || canonicalProblemURL(detail.problem?.url) !== ctx.problem.url ||
            !Array.isArray(detail.messages) || detail.messages.length > 50 || detail.messages.some((m, i, all) =>
              !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000 ||
              !Number.isSafeInteger(m.sequence) || m.sequence < 1 || (i && all[i - 1].sequence >= m.sequence))) throw new ApiError('invalid_response');
        return { messages: detail.messages, conversationId: detail.id, truncated: !!detail.messages_truncated, pendingAction };
      } catch (error) {
        if (error.status !== 404) throw error;
        await check(ctx);
        await chrome.storage.local.set({ [ctx.key]: { ...ctx.record, id: null } });
        await chrome.storage.session.remove(ctx.pendingKey);
        return { messages: [], conversationId: null, truncated: false, missing: true };
      }
    }
    async function turn(data) {
      const ctx = await context(data);
      const guard = ctx.key + ctx.record.generation;
      if (active.has(guard)) throw new ApiError('in_progress', 409);
      if (!['hint', 'discuss', 'debug', 'explain', 'solution', 'correction'].includes(data.kind) ||
          (data.kind === 'hint' && ![1, 2, 3, 4].includes(data.hintLevel))) throw new ApiError('invalid');
      const thought = data.userThought || '';
      const code = data.code || '';
      if (typeof thought !== 'string' || typeof code !== 'string' || thought.length > 6000 || code.length > 6000 || thought.length + code.length > 7800) throw new ApiError('invalid');
      const endpoint = ['hint', 'solution'].includes(data.kind) ? '/api/hints/' : '/api/chat/';
      const actionFields = endpoint.includes('hints') ? { hint_level: data.kind === 'solution' ? 4 : data.hintLevel } :
        { action: data.kind === 'correction' ? 'solution' : data.kind };
      const candidate = {
        language: ctx.language, user_thought: thought, code, ...actionFields,
        ...(ctx.record.id ? { conversation_id: ctx.record.id } : { problem: {
          title: ctx.problem.title, url: ctx.problem.url, statement: ctx.problem.description } })
      };
      const signature = JSON.stringify([data.kind, data.hintLevel || 0, thought, code]);
      active.add(guard);
      let pending;
      try {
        pending = (await chrome.storage.session.get(ctx.pendingKey))[ctx.pendingKey];
        if (pending && pending.generation === ctx.record.generation && pending.signature !== signature) {
          const error = new ApiError('in_progress', 409);
          error.resumeAction = resumeAction(pending, ctx.record.generation);
          throw error;
        }
        if (!pending || pending.generation !== ctx.record.generation) {
          pending = { generation: ctx.record.generation, signature, endpoint, body: { request_id: crypto.randomUUID(), ...candidate } };
          await chrome.storage.session.set({ [ctx.pendingKey]: pending });
        }
        await check(ctx);
        const result = await api.request(pending.endpoint, { method: 'POST', body: pending.body });
        await check(ctx);
        if (!Number.isSafeInteger(result?.conversation_id) || result.conversation_id < 1 ||
            (pending.body.conversation_id && pending.body.conversation_id !== result.conversation_id) ||
            typeof result.response !== 'string' || !result.response.trim() ||
            result.response.length > 8000 || result.request_id !== pending.body.request_id) throw new ApiError('invalid_response');
        await chrome.storage.local.set({ [ctx.key]: { ...ctx.record, id: result.conversation_id } });
        await chrome.storage.session.remove(ctx.pendingKey);
        return { message: result.response, conversationId: result.conversation_id, requestId: result.request_id };
      } catch (error) {
        const safe = error instanceof ApiError ? error : new ApiError('local_storage');
        if (safe.conversationId && !ctx.record.id) {
          await check(ctx);
          await chrome.storage.local.set({ [ctx.key]: { ...ctx.record, id: safe.conversationId } });
        }
        // Ambiguous transport/storage errors keep the EXACT body and UUID.
        // In-progress different-action errors must not erase the original turn.
        if (pending && !safe.retryable && safe.code !== 'stale') {
          await check(ctx);
          await chrome.storage.session.remove(ctx.pendingKey);
          if ([404, 410].includes(safe.status)) await chrome.storage.local.set({ [ctx.key]: { ...ctx.record, id: null } });
        }
        throw safe;
      } finally { active.delete(guard); }
    }
    async function reset(data, removeSaved = false) {
      const ctx = await context(data);
      if (removeSaved && !ctx.record.id) {
        if ((await chrome.storage.session.get(ctx.pendingKey))[ctx.pendingKey]) throw new ApiError('in_progress', 409);
        return { messages: [], conversationId: null, deleted: false };
      }
      const replacement = { id: removeSaved ? ctx.record.id : null, generation: crypto.randomUUID() };
      await chrome.storage.local.set({ [ctx.key]: replacement });
      await chrome.storage.session.remove(ctx.pendingKey);
      if (removeSaved && ctx.record.id) {
        try { await api.request(`/api/conversations/${ctx.record.id}/`, { method: 'DELETE' }); }
        catch (error) { if (error.status !== 404) throw error; }
        api.assertEpoch(ctx.epoch);
        await chrome.storage.local.set({ [ctx.key]: { ...replacement, id: null } });
      }
      return { messages: [], conversationId: null, deleted: removeSaved };
    }
    return { recover, turn, reset };
  }
  globalThis.StudentBuddyMentor = { createMentorClient, canonicalProblemURL, validateContext, languages };
})();
