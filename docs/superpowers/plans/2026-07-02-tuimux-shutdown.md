# Tuimux Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Tycho shuts down its detached tuimux server when the Tycho server exits.

**Architecture:** Extract shutdown coordination into a small `src/server/shutdown.ts` helper. `src/server/index.ts` registers signal handlers that call the helper for `SIGINT` and `SIGTERM`.

**Tech Stack:** Node HTTP server, `ws` WebSocket server, TypeScript, Node test runner.

---

### Task 1: Tests

**Files:**
- Create: `src/server/shutdown.test.ts`
- Create: `src/tuimux/client.test.ts`

- [x] **Step 1: Write shutdown cleanup test**

Create a test that builds fake HTTP server, WebSocket server, WebSocket clients, and tuimux client. Call `createShutdownController(...).shutdown(0)` and assert each close/shutdown function was called.

- [x] **Step 2: Write idempotency test**

Call `shutdown(0)` twice concurrently and assert cleanup functions ran only once.

- [x] **Step 3: Run focused test and confirm failure**

Run: `node --import tsx --test src/server/shutdown.test.ts`

Expected: FAIL because `src/server/shutdown.ts` does not exist.

- [x] **Step 4: Write tuimux spawn options test**

Create a test that imports `createTuimuxServerSpawnOptions()` and asserts `detached` is `false`.

- [x] **Step 5: Run focused spawn test and confirm failure**

Run: `node --import tsx --test src/tuimux/client.test.ts`

Expected: FAIL because `createTuimuxServerSpawnOptions` does not exist yet.

### Task 2: Implementation

**Files:**
- Create: `src/server/shutdown.ts`
- Modify: `src/server/index.ts`
- Modify: `src/tuimux/client.ts`
- Modify: `playwright.config.ts`

- [x] **Step 1: Implement shutdown controller**

Create `createShutdownController({ server, wss, tuimux, exit })` with a `shutdown(exitCode)` method. It closes all WebSocket clients with code `1001`, closes `wss`, closes `server`, calls `tuimux.shutdown()`, then calls `exit(exitCode)`.

- [x] **Step 2: Make cleanup idempotent**

Track the in-flight shutdown promise and return it on repeated calls.

- [x] **Step 3: Wire SIGINT and SIGTERM**

In `src/server/index.ts`, replace the current `SIGINT` handler with:

```ts
const shutdownController = createShutdownController({ server, wss, tuimux });
process.on("SIGINT", () => void shutdownController.shutdown(0));
process.on("SIGTERM", () => void shutdownController.shutdown(0));
```

- [x] **Step 4: Run focused test and confirm pass**

Run: `node --import tsx --test src/server/shutdown.test.ts`

Expected: PASS.

- [x] **Step 5: Keep tuimux attached to Tycho**

Export `createTuimuxServerSpawnOptions()` from `src/tuimux/client.ts`, set `detached: false`, and remove `serverProcess.unref()`.

- [x] **Step 6: Start Playwright server directly**

Change `playwright.config.ts` to run `node --import tsx src/server/index.ts` directly with the same environment variables.

- [x] **Step 7: Run focused spawn test and confirm pass**

Run: `node --import tsx --test src/tuimux/client.test.ts`

Expected: PASS.

### Task 3: Verification and Commit

**Files:**
- Modify as needed from Tasks 1-2.

- [x] **Step 1: Run typecheck**

Run: `scripts/typecheck`

Expected: PASS.

- [x] **Step 2: Run full verification**

Run: `scripts/verify`

Expected: PASS.

- [x] **Step 3: Run pre-commit hook**

Run: `.githooks/pre-commit`

Expected: PASS.

- [x] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-tuimux-shutdown-design.md docs/superpowers/plans/2026-07-02-tuimux-shutdown.md src/server/shutdown.ts src/server/shutdown.test.ts src/server/index.ts
git commit -m "fix: shut down tuimux with tycho"
```

Expected: commit succeeds.
