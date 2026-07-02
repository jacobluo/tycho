# Session Sidebar Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a close button to each session in the left Sessions list.

**Architecture:** Keep session lifecycle routed through the existing `close-window` event from `WorkspaceView.vue` to `App.vue`. Only the sidebar markup and CSS need production changes.

**Tech Stack:** Vue 3, TypeScript, Playwright, existing Express/WebSocket backend.

---

### Task 1: Regression Test

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add sidebar close E2E**

Add a Playwright test that creates `Sidebar Close`, locates `#sessionList .session-item` for that title, clicks `Close Sidebar Close`, and expects the session item and terminal card to disappear.

- [x] **Step 2: Run focused E2E and confirm failure**

Run: `scripts/e2e --grep "sidebar session close"`

Expected: FAIL before implementation because the sidebar close button does not exist.

### Task 2: Sidebar UI

**Files:**
- Modify: `src/client/src/views/WorkspaceView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Add close button to real session items**

In the `state.windows` loop, wrap session text in a content block and add:

```vue
<button class="session-close-button danger" type="button" :aria-label="`Close ${windowState.title}`" @click.stop="emit('close-window', windowState.id)">Close</button>
```

- [x] **Step 2: Style the item as a compact two-column row**

Use CSS grid so the title/status/path stay in the left column and the close button sits on the right without changing empty-state styling.

- [x] **Step 3: Run focused E2E and confirm pass**

Run: `scripts/e2e --grep "sidebar session close"`

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
git add docs/superpowers/specs/2026-07-02-session-sidebar-close-design.md docs/superpowers/plans/2026-07-02-session-sidebar-close.md e2e/project-management.spec.ts src/client/src/views/WorkspaceView.vue src/client/src/styles.css
git commit -m "feat: add sidebar session close controls"
```

Expected: commit succeeds.
