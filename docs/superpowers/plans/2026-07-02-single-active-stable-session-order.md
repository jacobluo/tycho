# Single Active Stable Session Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure session selection has exactly one active visual state and focus never reorders terminal cards.

**Architecture:** Keep `App.vue` as the owner of UI selection derivation. Keep `WorkspaceView.vue` presentational by receiving `selectedWindowId`. Add reusable order-preserving merge helpers where state enters from tuimux or websocket snapshots.

**Tech Stack:** Vue 3, TypeScript, Node test runner, Playwright.

---

### Task 1: Red Tests

**Files:**
- Modify: `src/tuimux/client.test.ts`
- Create: `src/shared/session-selection.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add snapshot order unit test**

Add a test that starts with windows `[33333, 11111, 22222]`, applies incoming snapshot windows `[22222, 33333, 11111]`, and expects the merged order to remain `[33333, 11111, 22222]`.

- [x] **Step 2: Add single selected window unit test**

Add `src/shared/session-selection.test.ts` to assert that a local focused pane wins over stale server active window state.

- [x] **Step 3: Add single-active stable-order E2E**

Create three named sessions, store the terminal card title order, click a left Sessions item, assert one active session item, assert the clicked session is active, and assert the card order is unchanged. Then click a terminal card and repeat the same assertions.

- [x] **Step 4: Run focused tests and confirm failure**

Run:

```bash
node --import tsx --test src/tuimux/client.test.ts
node --import tsx --test src/shared/session-selection.test.ts
scripts/e2e --grep "single active session selection"
```

Expected: FAIL before implementation.

### Task 2: Implementation

**Files:**
- Modify: `src/tuimux/client.ts`
- Create: `src/shared/session-selection.ts`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/WorkspaceView.vue`

- [x] **Step 1: Preserve snapshot order**

Add `mergeWindowsPreservingOrder(currentWindows, incomingWindows)` and use it for `snapshot` window state.

- [x] **Step 2: Create session selection helper**

Add `resolveSelectedWindowId(windows, state)` in `src/shared/session-selection.ts`.

- [x] **Step 3: Derive one selected window**

In `App.vue`, add `selectedWindowId` computed from local `activePaneId`, `state.activePaneId`, then `state.activeWindowId`.

- [x] **Step 4: Update sidebar selection click**

In `focusWindow(windowId)`, set local `activePaneId` to the selected window pane before focusing the terminal.

- [x] **Step 5: Use selectedWindowId in WorkspaceView**

Pass `selectedWindowId` into `WorkspaceView.vue` and update sidebar/card active classes to use only that prop.

- [x] **Step 6: Preserve browser state order**

When applying websocket state in `App.vue`, merge incoming windows with existing `state.windows` order.

- [x] **Step 7: Run focused tests and confirm pass**

Run:

```bash
node --import tsx --test src/tuimux/client.test.ts
node --import tsx --test src/shared/session-selection.test.ts
scripts/e2e --grep "single active session selection"
```

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

- [x] **Step 3: Run pre-commit**

Run: `.githooks/pre-commit`

Expected: PASS.

- [x] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-single-active-stable-session-order-design.md docs/superpowers/plans/2026-07-02-single-active-stable-session-order.md src/tuimux/client.ts src/tuimux/client.test.ts src/shared/session-selection.ts src/shared/session-selection.test.ts src/client/src/App.vue src/client/src/views/WorkspaceView.vue e2e/project-management.spec.ts
git commit -m "fix: keep one active session without reordering"
```

Expected: commit succeeds.
