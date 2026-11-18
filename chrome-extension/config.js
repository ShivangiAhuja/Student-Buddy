// Public build-time configuration. Change this AND manifest host/CSP permissions
// together for a reviewed HTTPS production backend. Never put secrets here.
globalThis.StudentBuddyConfig = Object.freeze({
  backendOrigin: 'http://127.0.0.1:8000',
  timeoutMs: 28000
});
