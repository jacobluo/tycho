# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Tycho for internet deployment by preventing secret exposure, enforcing production-safe authentication defaults, improving cookie/password/login protections, and validating WebSocket origins.

**Architecture:** Keep full `AgentEntry` objects inside the server/tuimux boundary, and introduce explicit public projections for anything sent to browsers. Add small pure helpers for password policy, login throttling, cookie attributes, and WebSocket origin checks so security behavior can be tested without launching the full server.

**Tech Stack:** TypeScript, Node built-in test runner, Express, `ws`, Vue, SQLite via `node:sqlite`.

---

## File Structure

- `src/runtime/config.ts`: Add public entry/state projection helpers that omit `env`.
- `src/runtime/config.test.ts`: Test public projections and internal env preservation.
- `src/runtime/auth.ts`: Add password policy, production admin bootstrap guard, and login throttle.
- `src/runtime/auth.test.ts`: Test password policy, bootstrap guard, and throttle behavior.
- `src/runtime/security.ts`: Add pure helpers for cookie attributes and WebSocket origin checks.
- `src/runtime/security.test.ts`: Test cookie policy and origin matching rules.
- `src/server/index.ts`: Use public projections, login throttle, cookie policy, and WebSocket origin guard.

### Task 1: Browser-Safe Runtime Projections

**Files:**
- Modify: `src/runtime/config.ts`
- Modify: `src/runtime/config.test.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Write failing projection tests**

Add these imports to `src/runtime/config.test.ts`:

```ts
import {
  addManagedProject,
  createSessionEntry,
  getProject,
  getPublicRuntimeConfig,
  removeManagedProject,
  readRuntimeConfig,
  toPublicAgentEntry,
  toPublicTuimuxState
} from "./config.js";
```

Add this test inside `describe("runtime config", () => { ... })`:

```ts
  test("browser-safe session entries omit env while internal entries keep it", () => {
    const projectPath = makeProjectDir("safe-entry");
    process.env.CODEBUDDY_TOKEN = "unit-test-token";
    process.env.CODEBUDDY_ENV_JSON = JSON.stringify({ EXTRA_SECRET: "hidden" });
    const runtime = readRuntimeConfig();
    const agent = runtime.agents.find((candidate) => candidate.id === "codebuddy")!;
    const project = { id: "safe-entry", name: "Safe Entry", path: projectPath };

    const entry = createSessionEntry(agent, project, "Safe entry");
    const publicEntry = toPublicAgentEntry(entry);

    assert.equal(entry.env?.CODEBUDDY_TOKEN, "unit-test-token");
    assert.equal(entry.env?.EXTRA_SECRET, "hidden");
    assert.equal("env" in publicEntry, false);
    assert.equal(publicEntry.id, entry.id);
    assert.equal(publicEntry.name, entry.name);
    assert.equal(publicEntry.cwd, projectPath);
  });
```

Add this second test:

```ts
  test("browser-safe tuimux state omits nested pane env", () => {
    const projectPath = makeProjectDir("safe-state");
    const runtime = readRuntimeConfig();
    const project = { id: "safe-state", name: "Safe State", path: projectPath };
    const entry = createSessionEntry(runtime.agents[0], project, "Safe state", {
      REMOTE_TUI_USER_ID: "user-1",
      SECRET_VALUE: "hidden"
    });

    const publicState = toPublicTuimuxState({
      connected: true,
      windows: [{ id: "window-1", title: "Safe state", layout: {}, activePaneId: "pane-1" }],
      panes: [{ paneId: "pane-1", entry, status: "running", buffer: "hello" }],
      activeWindowId: "window-1",
      activePaneId: "pane-1"
    });

    assert.equal("env" in publicState.panes[0].entry, false);
    assert.equal(publicState.panes[0].entry.name, "Safe state");
    assert.equal(publicState.panes[0].buffer, "hello");
  });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
scripts/test --test-name-pattern "browser-safe"
```

Expected: FAIL with TypeScript/import errors because `toPublicAgentEntry` and `toPublicTuimuxState` do not exist.

- [ ] **Step 3: Implement public projection helpers**

In `src/runtime/config.ts`, after `RuntimeConfig`, add:

```ts
export type PublicAgentEntry = Omit<AgentEntry, "env">;

export type PublicTuimuxPane = {
  paneId: string;
  entry: PublicAgentEntry;
  status: "running" | "stopped" | "error";
  buffer: string;
  runId?: number;
};

export type PublicTuimuxWindow = {
  id: string;
  title: string;
  layout: unknown;
  activePaneId: string;
};

export type PublicTuimuxState = {
  connected: boolean;
  serverVersion?: string;
  windows: PublicTuimuxWindow[];
  panes: PublicTuimuxPane[];
  activeWindowId: string | null;
  activePaneId: string | null;
};
```

Near `getPublicRuntimeConfig`, add:

```ts
export function toPublicAgentEntry(entry: AgentEntry): PublicAgentEntry {
  const { env: _env, ...publicEntry } = entry;
  return publicEntry;
}

export function toPublicTuimuxState(state: {
  connected: boolean;
  serverVersion?: string;
  windows: PublicTuimuxWindow[];
  panes: Array<{
    paneId: string;
    entry: AgentEntry;
    status: "running" | "stopped" | "error";
    buffer: string;
    runId?: number;
  }>;
  activeWindowId: string | null;
  activePaneId: string | null;
}): PublicTuimuxState {
  return {
    ...state,
    windows: state.windows.map((window) => ({ ...window })),
    panes: state.panes.map((pane) => ({
      ...pane,
      entry: toPublicAgentEntry(pane.entry)
    }))
  };
}
```

- [ ] **Step 4: Wire projections into server responses**

Modify imports in `src/server/index.ts`:

```ts
import {
  addManagedProject,
  createSessionEntry,
  getAgent,
  getProject,
  getPublicRuntimeConfig,
  readRuntimeConfig,
  removeManagedProject,
  toPublicAgentEntry,
  toPublicTuimuxState,
  type RuntimeConfig
} from "../runtime/config.js";
```

Change `filterStateForUser` to return projected state:

```ts
function filterStateForUser(user: PublicUser) {
  const state = tuimux.getState();
  if (user.role === "admin") {
    return toPublicTuimuxState(state);
  }
  const panes = state.panes.filter((pane) => paneVisibleToUser(user, pane));
  const paneIds = new Set(panes.map((pane) => pane.paneId));
  const windows = state.windows.filter((window) => paneIds.has(window.activePaneId));
  const activeWindowId = windows.some((window) => window.id === state.activeWindowId) ? state.activeWindowId : null;
  const activePaneId = paneIds.has(state.activePaneId || "") ? state.activePaneId : null;
  return toPublicTuimuxState({
    ...state,
    windows,
    panes,
    activeWindowId,
    activePaneId
  });
}
```

Add internal visibility helpers so authorization still uses full tuimux state:

```ts
function internalWindowVisibleToUser(user: PublicUser, windowId: string): boolean {
  const state = tuimux.getState();
  if (user.role === "admin") {
    return state.windows.some((window) => window.id === windowId);
  }
  const visiblePaneIds = new Set(
    state.panes.filter((pane) => paneVisibleToUser(user, pane)).map((pane) => pane.paneId)
  );
  return state.windows.some((window) => window.id === windowId && visiblePaneIds.has(window.activePaneId));
}

function internalPaneVisibleById(user: PublicUser, paneId: string): boolean {
  const state = tuimux.getState();
  return state.panes.some((pane) => pane.paneId === paneId && paneVisibleToUser(user, pane));
}
```

Update callers of `windowVisibleToUser` and `paneVisibleById` in authorization branches to use the internal helpers.

Change session responses:

```ts
response.status(202).json({ entry: toPublicAgentEntry(entry), project });
```

and:

```ts
send(socket, { type: "session_requested", entry: toPublicAgentEntry(entry), project });
```

- [ ] **Step 5: Run focused projection tests and verify GREEN**

Run:

```bash
scripts/test --test-name-pattern "browser-safe"
```

Expected: PASS.

### Task 2: Password Policy, Production Bootstrap, and Login Throttle

**Files:**
- Modify: `src/runtime/auth.ts`
- Modify: `src/runtime/auth.test.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Write failing auth hardening tests**

Add these imports to `src/runtime/auth.test.ts`:

```ts
import {
  assignProjectsToUser,
  bootstrapAdminUser,
  changeOwnPassword,
  createSession,
  createUser,
  deleteSession,
  getLoginThrottle,
  getSessionUser,
  listUsers,
  loginUser,
  recordFailedLogin,
  resetLoginThrottle,
  softDeleteUser,
  updateUserPassword,
  updateUserRole,
  updateUserStatus,
  userCanAccessProject,
  verifyPassword
} from "./auth.js";
```

Add environment cleanup in `beforeEach`:

```ts
  delete process.env.NODE_ENV;
  delete process.env.TYCHO_ALLOW_DEFAULT_ADMIN_PASSWORD;
```

Add tests:

```ts
  test("production bootstrap requires an explicit admin password", async () => {
    process.env.NODE_ENV = "production";

    await assert.rejects(
      () => bootstrapAdminUser(),
      /TYCHO_ADMIN_PASSWORD is required/
    );
  });

  test("production bootstrap accepts an explicit strong admin password", async () => {
    process.env.NODE_ENV = "production";
    process.env.TYCHO_ADMIN_PASSWORD = "correct horse battery staple";

    const admin = await bootstrapAdminUser();

    assert.equal(admin.username, "admin");
    assert.equal(admin.role, "admin");
    assert.equal(await verifyPassword("correct horse battery staple", admin.passwordHash), true);
  });

  test("password policy rejects short passwords for create update and own change", async () => {
    await bootstrapAdminUser();

    await assert.rejects(
      () => createUser({ username: "shorty", password: "short", role: "user" }),
      /Password must be at least 12 characters/
    );

    const user = await createUser({ username: "strong", password: "long-enough-password", role: "user" });

    await assert.rejects(
      () => updateUserPassword(user.id, "short"),
      /Password must be at least 12 characters/
    );
    await assert.rejects(
      () => changeOwnPassword(user.id, "long-enough-password", "short"),
      /Password must be at least 12 characters/
    );
  });

  test("login throttle blocks repeated failures and clears on success", async () => {
    resetLoginThrottle();
    const key = "alice:127.0.0.1";

    for (let index = 0; index < 5; index += 1) {
      recordFailedLogin(key);
    }

    assert.equal(getLoginThrottle(key).blocked, true);
    resetLoginThrottle(key);
    assert.equal(getLoginThrottle(key).blocked, false);
  });
```

- [ ] **Step 2: Run focused auth tests and verify RED**

Run:

```bash
scripts/test --test-name-pattern "production bootstrap|password policy|login throttle"
```

Expected: FAIL because throttle helpers do not exist and password/bootstrap behavior is not enforced.

- [ ] **Step 3: Implement password policy and bootstrap guard**

In `src/runtime/auth.ts`, add:

```ts
const MIN_PASSWORD_LENGTH = 12;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
```

Replace `assertPassword` with:

```ts
function assertPassword(password: string): void {
  if (!password) {
    throw new Error("Password is required");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function adminBootstrapPassword(): string {
  if (process.env.TYCHO_ADMIN_PASSWORD) {
    return process.env.TYCHO_ADMIN_PASSWORD;
  }
  if (isProduction() && process.env.TYCHO_ALLOW_DEFAULT_ADMIN_PASSWORD !== "1") {
    throw new Error("TYCHO_ADMIN_PASSWORD is required when bootstrapping admin in production");
  }
  return "admin";
}
```

In `bootstrapAdminUser`, replace:

```ts
const password = process.env.TYCHO_ADMIN_PASSWORD || "admin";
```

with:

```ts
const password = adminBootstrapPassword();
```

- [ ] **Step 4: Preserve development tests with strong passwords**

Update existing tests in `src/runtime/auth.test.ts` to use passwords with at least 12 characters, except the default bootstrap test which still verifies development `admin/admin` if the guard intentionally allows it.

Examples:

```ts
const user = await createUser({ username: "alice", password: "secret-secret", role: "user" });
```

and:

```ts
await updateUserPassword(user.id, "new-password-123");
```

- [ ] **Step 5: Implement login throttle helpers**

In `src/runtime/auth.ts`, add:

```ts
type LoginThrottleRecord = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

const LOGIN_THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_THROTTLE_BLOCK_MS = 10 * 60 * 1000;
const LOGIN_THROTTLE_MAX_FAILURES = 5;
const loginThrottle = new Map<string, LoginThrottleRecord>();

export function getLoginThrottle(key: string, now = Date.now()): { blocked: boolean; retryAfterSeconds: number } {
  const record = loginThrottle.get(key);
  if (!record) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  if (record.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000)
    };
  }
  if (now - record.firstFailureAt > LOGIN_THROTTLE_WINDOW_MS) {
    loginThrottle.delete(key);
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordFailedLogin(key: string, now = Date.now()): void {
  const existing = loginThrottle.get(key);
  const record = !existing || now - existing.firstFailureAt > LOGIN_THROTTLE_WINDOW_MS
    ? { failures: 0, firstFailureAt: now, blockedUntil: 0 }
    : existing;
  record.failures += 1;
  if (record.failures >= LOGIN_THROTTLE_MAX_FAILURES) {
    record.blockedUntil = now + LOGIN_THROTTLE_BLOCK_MS;
  }
  loginThrottle.set(key, record);
}

export function resetLoginThrottle(key?: string): void {
  if (key) {
    loginThrottle.delete(key);
    return;
  }
  loginThrottle.clear();
}
```

- [ ] **Step 6: Wire throttle into login endpoint**

Modify imports in `src/server/index.ts`:

```ts
  getLoginThrottle,
  recordFailedLogin,
  resetLoginThrottle,
```

Add helper near cookie helpers:

```ts
function loginThrottleKey(request: IncomingMessage, username: string): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0];
  const ip = forwardedIp?.trim() || request.socket.remoteAddress || "unknown";
  return `${username.trim().toLowerCase()}:${ip}`;
}
```

In `/api/auth/login`, after reading username/password:

```ts
const throttleKey = loginThrottleKey(request, username);
const throttle = getLoginThrottle(throttleKey);
if (throttle.blocked) {
  response.status(429).json({ error: "Too many failed login attempts. Try again later." });
  return;
}
```

After failed login:

```ts
recordFailedLogin(throttleKey);
```

After successful login:

```ts
resetLoginThrottle(throttleKey);
```

- [ ] **Step 7: Run focused auth tests and verify GREEN**

Run:

```bash
scripts/test --test-name-pattern "production bootstrap|password policy|login throttle"
```

Expected: PASS.

### Task 3: Cookie Policy and WebSocket Origin Guard

**Files:**
- Create: `src/runtime/security.ts`
- Create: `src/runtime/security.test.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Write failing security helper tests**

Create `src/runtime/security.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isAllowedWebSocketOrigin, sessionCookieAttributes } from "./security.js";

describe("security helpers", () => {
  test("websocket origin allows missing origin", () => {
    assert.equal(isAllowedWebSocketOrigin(undefined, "tycho.example.com"), true);
  });

  test("websocket origin allows same-origin https host", () => {
    assert.equal(isAllowedWebSocketOrigin("https://tycho.example.com", "tycho.example.com"), true);
  });

  test("websocket origin rejects cross-origin requests", () => {
    assert.equal(isAllowedWebSocketOrigin("https://evil.example.com", "tycho.example.com"), false);
  });

  test("websocket origin allows exact configured origins", () => {
    assert.equal(
      isAllowedWebSocketOrigin("https://admin.example.com", "tycho.example.com", "https://admin.example.com"),
      true
    );
  });

  test("websocket origin does not allow suffix matches", () => {
    assert.equal(
      isAllowedWebSocketOrigin("https://evil-tycho.example.com", "tycho.example.com", "https://tycho.example.com"),
      false
    );
  });

  test("production session cookies are secure and strict", () => {
    assert.deepEqual(sessionCookieAttributes("production"), ["HttpOnly", "SameSite=Strict", "Secure"]);
  });

  test("development session cookies stay local-http friendly", () => {
    assert.deepEqual(sessionCookieAttributes("development"), ["HttpOnly", "SameSite=Lax"]);
  });
});
```

- [ ] **Step 2: Run focused security tests and verify RED**

Run:

```bash
scripts/test --test-name-pattern "security helpers"
```

Expected: FAIL because `src/runtime/security.ts` does not exist.

- [ ] **Step 3: Implement security helpers**

Create `src/runtime/security.ts`:

```ts
export function sessionCookieAttributes(nodeEnv = process.env.NODE_ENV): string[] {
  if (nodeEnv === "production") {
    return ["HttpOnly", "SameSite=Strict", "Secure"];
  }
  return ["HttpOnly", "SameSite=Lax"];
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function sameOriginForHost(origin: string, host: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized || !host) {
    return false;
  }
  return normalized === `https://${host}` || normalized === `http://${host}`;
}

export function isAllowedWebSocketOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowedOriginsEnv = process.env.TYCHO_ALLOWED_ORIGINS
): boolean {
  if (!origin) {
    return true;
  }
  if (host && sameOriginForHost(origin, host)) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }
  const allowedOrigins = (allowedOriginsEnv || "")
    .split(",")
    .map((candidate) => normalizeOrigin(candidate.trim()))
    .filter((candidate): candidate is string => Boolean(candidate));
  return allowedOrigins.includes(normalized);
}
```

- [ ] **Step 4: Wire cookie attributes into server**

Modify imports in `src/server/index.ts`:

```ts
import { isAllowedWebSocketOrigin, sessionCookieAttributes } from "../runtime/security.js";
```

Replace `sessionCookie` and `clearSessionCookie` with:

```ts
function sessionCookie(token: string): string {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${sessionMaxAgeSeconds}`,
    ...sessionCookieAttributes()
  ];
  return attributes.join("; ");
}

function clearSessionCookie(): string {
  const attributes = [
    `${sessionCookieName}=`,
    "Path=/",
    "Max-Age=0",
    ...sessionCookieAttributes()
  ];
  return attributes.join("; ");
}
```

- [ ] **Step 5: Wire WebSocket origin guard into server**

At the top of `wss.on("connection", async (socket, request) => { ... })`, add:

```ts
  if (!isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)) {
    send(socket, { type: "error", message: "Origin not allowed" });
    socket.close(1008, "Origin not allowed");
    return;
  }
```

- [ ] **Step 6: Run focused security tests and verify GREEN**

Run:

```bash
scripts/test --test-name-pattern "security helpers"
```

Expected: PASS.

### Task 4: Full Regression and Plan Closeout

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-security-hardening.md`

- [ ] **Step 1: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [ ] **Step 2: Run unit tests**

Run:

```bash
scripts/test
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
scripts/verify
```

Expected: PASS, including Playwright E2E and production build.

- [ ] **Step 4: Update this plan**

Mark completed checkboxes for every implemented step. If implementation diverged from the plan, add a short note under the affected task explaining why.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add src/runtime/config.ts src/runtime/config.test.ts src/runtime/auth.ts src/runtime/auth.test.ts src/runtime/security.ts src/runtime/security.test.ts src/server/index.ts docs/superpowers/plans/2026-07-02-security-hardening.md
git commit -m "fix: harden internet-facing security boundaries"
```

Expected: commit succeeds after repository verification.
