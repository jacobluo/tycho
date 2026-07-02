# Security Hardening Design

## Context

Tycho is moving from a local proof of concept toward an internet-accessible deployment. The browser should remain a remote view/controller for server-side TUI agents, not a trusted runtime that receives provider credentials or arbitrary server internals.

The current implementation has three high-risk gaps:

- Internal agent/session entries can include `env`, including provider tokens, and those entries are returned through session and state APIs.
- A fresh database bootstraps `admin/admin` by default.
- WebSocket connections authenticate by cookie but do not check browser `Origin`.

This design defines a first hardening slice that keeps the product model intact while closing the most direct exposure paths.

## Goals

- Never send agent environment variables or provider credentials to browser clients.
- Keep full environment variables available to tuimux when starting agent processes.
- Prevent implicit `admin/admin` bootstrap in production.
- Add production-appropriate session cookie settings, password rules, and login throttling.
- Reject cross-origin browser WebSocket connections unless explicitly allowlisted.

## Non-Goals

- Do not add multi-factor authentication.
- Do not add password reset emails or account recovery.
- Do not replace the SQLite auth store.
- Do not redesign RBAC or project assignment.
- Do not add broad CSRF infrastructure in this slice.

## Design

### 1. Browser-Safe Runtime Projection

Tycho will separate internal runtime entries from browser-visible entries.

Internal `AgentEntry` objects continue to include `env` and are still passed to `tuimux.createWindow(entry)`. Browser-facing objects use explicit projection helpers that omit `env`.

The projection applies to:

- `POST /api/sessions` response payloads.
- WebSocket `session_requested` payloads.
- `GET /api/state` payloads.
- Initial WebSocket state payloads.
- WebSocket state broadcasts.

The server may continue to use internal tuimux state for authorization checks, including checking `entry.env.REMOTE_TUI_USER_ID`. That state is projected only after filtering and before sending to clients.

The public entry shape keeps display-safe fields such as `id`, `name`, `command`, `args`, `cwd`, `autostart`, and `restart_on_exit`. It never includes `env`.

### 2. Production Admin Bootstrap

When `NODE_ENV=production` and the user database is empty, Tycho must not create an implicit `admin/admin` user.

Production bootstrap rules:

- If `TYCHO_ADMIN_PASSWORD` is set, create the first admin using `TYCHO_ADMIN_USERNAME` or `admin`.
- If `TYCHO_ALLOW_DEFAULT_ADMIN_PASSWORD=1` is set, allow the local default for explicitly controlled deployments.
- Otherwise, startup fails with a clear error requiring `TYCHO_ADMIN_PASSWORD`.

Development and test environments keep the existing `admin/admin` bootstrap so local setup and E2E tests remain simple.

### 3. Password Rules

New passwords must be at least 12 characters.

This applies to:

- Admin-created users.
- Admin password resets.
- User-initiated password changes.
- Initial production admin password bootstrap.

The rule intentionally stays simple for this slice. It avoids complex composition requirements that tend to reduce usability without materially improving security.

### 4. Login Throttling

The login endpoint will add a small in-memory failed-login throttle keyed by username plus request IP.

Behavior:

- Failed attempts increment the key.
- Too many failed attempts in the window return HTTP 429.
- Successful login clears that key.
- The throttle does not persist across process restarts.

This is not a replacement for edge-level rate limiting, but it provides an application-level floor for internet deployment.

### 5. Session Cookie Policy

Session cookies remain `HttpOnly`.

Production cookies add:

- `Secure`
- `SameSite=Strict`

Development/test cookies keep the current local-friendly behavior so `http://localhost` still works without TLS.

### 6. WebSocket Origin Guard

WebSocket connections check `Origin` before session lookup.

Rules:

- Missing `Origin` is allowed for non-browser clients and local tooling.
- Same-origin browser requests are allowed by comparing `Origin` to the request `Host`.
- `TYCHO_ALLOWED_ORIGINS` may add comma-separated exact origins.
- Wildcards and suffix matching are not supported.
- Rejected connections close with code `1008` and a generic `Origin not allowed` reason.

The origin check will live in a small pure helper so it can be unit-tested without starting the server.

## Data Flow

Session creation:

1. Browser sends `agentId` and `projectId`.
2. Server validates user access to the selected project.
3. Server creates a full internal session entry including env.
4. Server sends the full entry only to tuimux.
5. Server returns a projected public entry to the browser.

State broadcast:

1. Tuimux emits full internal state.
2. Server filters windows and panes for the user.
3. Server projects pane entries to public entries.
4. Server sends only projected state to the browser.

WebSocket connection:

1. Server checks `Origin`.
2. Server checks session cookie.
3. Server sends public config and projected state.

## Error Handling

- Production startup without a safe admin password fails fast with a clear configuration error.
- Login throttling uses HTTP 429 with a generic message.
- WebSocket origin failures use close code `1008` with no sensitive details.
- Password validation errors describe the minimum requirement without echoing input.

## Testing

Unit tests will cover:

- Public projection removes `env` from session entries and nested pane state.
- Internal session entries still contain env for tuimux.
- Production bootstrap rejects implicit `admin/admin`.
- Development/test bootstrap still allows default credentials.
- Password creation and updates reject passwords shorter than 12 characters.
- Login throttling blocks repeated failed logins and clears on success.
- WebSocket origin helper allows same-origin and allowlisted origins, rejects cross-origin, and allows missing origin.

Existing E2E tests that use `admin/admin` run in development mode and should continue to pass.
