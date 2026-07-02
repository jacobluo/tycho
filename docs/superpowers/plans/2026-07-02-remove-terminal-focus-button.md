# Remove Terminal Focus Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant `Focus` button from terminal card headers.

**Architecture:** Keep existing pointer/focus events on the terminal card and host. Remove only the titlebar button and add an E2E assertion for the simplified action area.

**Tech Stack:** Vue 3, TypeScript, Playwright.

---

### Task 1: Regression Test

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add E2E assertion**

Add a Playwright test that creates `No Focus Button`, locates its `.terminal-card`, asserts `Focus` button count is `0`, and asserts `Close` is visible.

- [x] **Step 2: Run focused E2E and confirm failure**

Run: `scripts/e2e --grep "terminal card actions"`

Expected: FAIL before implementation because the `Focus` button still exists.

### Task 2: UI Change

**Files:**
- Modify: `src/client/src/views/WorkspaceView.vue`

- [x] **Step 1: Remove Focus button**

Delete the terminal titlebar button:

```vue
<button type="button" @click="emit('focus-pane', entry)">Focus</button>
```

- [x] **Step 2: Run focused E2E and confirm pass**

Run: `scripts/e2e --grep "terminal card actions"`

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
git add docs/superpowers/specs/2026-07-02-remove-terminal-focus-button-design.md docs/superpowers/plans/2026-07-02-remove-terminal-focus-button.md e2e/project-management.spec.ts src/client/src/views/WorkspaceView.vue
git commit -m "fix: remove redundant terminal focus button"
```

Expected: commit succeeds.
