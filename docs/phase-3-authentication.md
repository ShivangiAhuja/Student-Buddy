# Phase 3: authentication

The extension and health endpoint are unchanged. `accounts` uses Django's standard User model, Django password validators and hashing, DRF serializers and permissions, and Simple JWT 5.5.1.

## File responsibilities

- `accounts/serializers.py`: validates registration and passwords, creates users through `create_user`, limits profile output, and validates refresh-token ownership for logout. Login preserves password whitespace. Refresh handles deleted users without a server error.
- `accounts/views.py`: public registration/login/refresh, protected current-user profile and logout; authentication responses are not cacheable.
- `accounts/throttles.py`: distinct per-IP limits for each auth action, ignoring user-supplied forwarded-IP headers.
- `accounts/urls.py`: five `/api/auth/` routes, included by `config/urls.py`.
- `accounts/migrations/0001_unique_user_email.py`: adds a unique partial index on lowercase nonempty `auth_user.email`. This supplies database enforcement missing from Django's standard User model without replacing that model. SQLite and PostgreSQL support the SQL; PostgreSQL has not been run here. Resolve any existing duplicate emails before applying it. Standard Django usernames remain case-sensitive.
- `config/settings.py`: JWT authentication and authenticated permission defaults, environment lifetimes and signing key, blacklist installation, rotation, and auth throttle rates.
- `.env.example` and `requirements.txt`: placeholder settings and pinned direct dependency.
- `accounts/tests.py`: isolated database tests for registration, validation, credentials, JWTs, profile isolation, inactive/deleted users, logout ownership, rotation, and throttling. Original health tests remain intact.

## Security boundaries

The separate JWT signing key lives only in environment configuration. The local ignored `.env` receives a generated key without displaying it. No application logging of credentials or tokens is added. Public endpoints ignore stale Authorization headers; protected endpoints accept access JWTs only. Profile always uses `request.user`.

Refresh rotation consumes and blacklists the old refresh token. Logout requires a valid access token and an owned refresh token; it revokes only that refresh token. Access tokens remain valid until expiry. Existing sessions are not all revoked. Concurrent refresh replay and token-family reuse detection require additional design before stronger guarantees can be claimed.

The default in-memory cache is adequate only for initial local throttle checks; shared caching and infrastructure protection are needed for deployment. Cache operations are not atomic. CORS remains disabled. Email verification, password reset, MFA, and immediate access revocation are future work. Duplicate-registration validation reveals availability by design. Use HTTPS and DEBUG=false in production, and keep bodies/Authorization headers out of production logs.

## Verification

From `backend/`, run `manage.py migrate`, `manage.py check`, and `manage.py test --verbosity 2` using `.venv\Scripts\python.exe`. The suite creates and destroys an isolated SQLite test database. Run the existing extension tests from the root with `node --test tests/extension.test.cjs`. Full install, environment setup, endpoint reference, PowerShell request examples, and token cleanup instructions are in the main README.

No Groq calls, conversation models, extension integration, deployment, commit, or push are included in this phase.
