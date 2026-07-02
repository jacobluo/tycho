# Session Close Focus Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom session close confirmation, preserve focused window ordering, and highlight the active sidebar session.

**Architecture:** Keep `App.vue` as the owner of workspace-level modal state. Keep `WorkspaceView.vue` presentational by emitting close/focus events. Extract a small exported reducer helper in `src/tuimux/client.ts` so ordering behavior is unit-testable.

**Tech Stack:** Vue 3, TypeScript, Playwright, Node test runner.

---

### Task 1: Tests

**Files:**
- Modify: `src/tuimux/client.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add unit test for preserving window order**

Test a helper with windows `[11111, 33333, 22222]`, update `33333`, and assert the order remains `[11111, 33333, 22222]`.

- [x] **Step 2: Add custom close dialog E2E**

Create `Confirm Close`, click terminal card `Close`, assert heading `Close Session`, assert no native browser dialog fired, cancel once, then confirm and assert the card disappears.

- [x] **Step 3: Add sidebar active state E2E**

Create two sessions, click one left Sessions item, and assert that item has `active` class.

- [x] **Step 4: Run focused tests and confirm failure**

Run:

```bash
node --import tsx --test src/tuimux/client.test.ts
scripts/e2e --grep "session close focus polish"
```

Expected: FAIL before implementation.

### Task 2: Implementation

**Files:**
- Modify: `src/tuimux/client.ts`
- Create: `src/client/src/components/ConfirmSessionCloseDialog.vue`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/WorkspaceView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Preserve window order**

Add `upsertWindowPreservingOrder(windows, nextWindow)` and use it for `window_changed`.

- [x] **Step 2: Add confirmation dialog component**

Create a modal with heading `Close Session`, session title text, `Cancel`, and `Close Session`.

- [x] **Step 3: Route close clicks through dialog**

Change `closeWindow(windowId)` in `App.vue` to open modal state. Add `confirmCloseWindow()` to send `{ type: "close_window", windowId }`.

- [x] **Step 4: Add sidebar active class**

In `WorkspaceView.vue`, add `active` class when `state.activeWindowId === windowState.id || activePaneId === windowState.activePaneId`.

- [x] **Step 5: Add CSS**

Style `.session-item.active` with accent border/background and style the close confirmation modal using existing modal primitives.

- [x] **Step 6: Run focused tests and confirm pass**

Run:

```bash
node --import tsx --test src/tuimux/client.test.ts
scripts/e2e --grep "session close focus polish"
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

- [x] **Step 3: Run pre-commit hook**

Run: `.githooks/pre-commit`

Expected: PASS.

- [x] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-session-close-focus-polish-design.md docs/superpowers/plans/2026-07-02-session-close-focus-polish.md src/tuimux/client.ts src/tuimux/client.test.ts src/client/src/components/ConfirmSessionCloseDialog.vue src/client/src/App.vue src/client/src/views/WorkspaceView.vue src/client/src/styles.css e2e/project-management.spec.ts
git commit -m "fix: polish session close and focus"
```

Expected: commit succeeds.
