# Workspace Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix workspace menu, session creation, and terminal focus interactions.

**Architecture:** Keep the Vue single-page client as the interaction owner. Reuse the existing WebSocket `create_session` API because the server already accepts an optional session `label`.

**Tech Stack:** Vue 3, Vite, TypeScript, Playwright, Express/WebSocket.

---

### Task 1: Regression Tests

**Files:**
- Modify: `e2e/project-management.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/e2e`
- Modify: `src/shared/paths.ts`

- [x] **Step 1: Add account menu outside-click coverage**

Add a Playwright test that logs in, opens the account menu, clicks the workspace heading, and expects `Log Out` to disappear.

- [x] **Step 2: Add session naming coverage**

Add a Playwright test that intercepts the browser WebSocket, clicks the CodeBuddy launcher, verifies a `Name Session` dialog, fills `Focused Build`, submits, and expects the outgoing `create_session` payload to contain `"label":"Focused Build"`.

- [x] **Step 3: Add no-scroll focus coverage**

Add a Playwright test that creates a named session, makes the terminal grid scrollable, clicks a session item, and expects the scroll position to remain stable.

- [x] **Step 4: Run focused E2E and confirm failure**

Run: `scripts/e2e --grep "workspace interactions"`

Expected: FAIL before production implementation because the menu remains open, no naming dialog exists, and focusing a window scrolls.

- [x] **Step 5: Isolate Playwright tuimux state**

Add `TYCHO_TUIMUX_HOME` support in `src/shared/paths.ts`, set it from `playwright.config.ts`, and forward arguments from `scripts/e2e` so focused E2E runs do not reuse local `.tuimux` state.

### Task 2: UI Implementation

**Files:**
- Modify: `src/client/src/components/AccountMenu.vue`
- Create: `src/client/src/components/CreateSessionDialog.vue`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Close account menu from outside**

Add a root ref plus document `pointerdown` and `keydown` listeners in `AccountMenu.vue`. Close only when the event target is outside the component or Escape is pressed.

- [x] **Step 2: Add session naming dialog component**

Create `CreateSessionDialog.vue` with one `Session Name` input, `Cancel`, and `Start Session`. Disable submit while the trimmed name is empty.

- [x] **Step 3: Open the dialog from agent launchers**

Change `App.vue` so `@create-session` opens the dialog with the selected agent id. Submitting sends `{ type: "create_session", agentId, projectId, label }`.

- [x] **Step 4: Preserve terminal position while focusing**

Remove `scrollIntoView` from `focusWindow`. Focus xterm when clicking cards or session items without focusing the host element recursively.

- [x] **Step 5: Run focused E2E and confirm pass**

Run: `scripts/e2e --grep "workspace interactions"`

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

- [x] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-workspace-interactions-design.md docs/superpowers/plans/2026-07-02-workspace-interactions.md e2e/project-management.spec.ts playwright.config.ts scripts/e2e src/shared/paths.ts src/client/src/components/AccountMenu.vue src/client/src/components/CreateSessionDialog.vue src/client/src/App.vue src/client/src/styles.css
git commit -m "fix: polish workspace interactions"
git push
```

Expected: commit and push succeed.
