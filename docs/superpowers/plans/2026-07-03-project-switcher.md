# Custom Project Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native topbar project dropdown with a custom Tycho-styled project switcher.

**Architecture:** Add a focused Vue component for project selection and keep App.vue as the state owner. Tests interact with the component through accessible labels and menu items instead of native `selectOption`.

**Tech Stack:** Vue 3, TypeScript, Playwright E2E, existing CSS token system.

---

### Task 1: Add Failing E2E Coverage

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add a helper that switches projects via a custom menu**

Add `selectWorkspaceProject(page, projectName)` near existing helpers. It should click `Project <current>` and choose a menu option named for the target project.

- [x] **Step 2: Add a failing test**

Add a test that logs in, creates two managed projects, returns to the workspace, asserts `#projectSelect` is absent, opens the project switcher, selects the second project, and verifies `#projectPath` updates.

- [x] **Step 3: Run focused E2E**

Run: `scripts/e2e --grep "custom project switcher"`

Expected: FAIL because the native `#projectSelect` still exists and the custom trigger is missing.

### Task 2: Implement Component And Styles

**Files:**
- Create: `src/client/src/components/ProjectSwitcher.vue`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Create component**

Implement a labelled button + menu with outside-click and Escape close behavior. Emit `update:selectedProjectId` and `change` after selection.

- [x] **Step 2: Wire App.vue**

Replace the topbar `<select id="projectSelect">` with `ProjectSwitcher` and route its `change` event to `persistSelectedProject`.

- [x] **Step 3: Style both themes**

Add dark defaults and light overrides using existing `--panel`, `--line`, `--accent`, and `--sidebar` tokens.

- [x] **Step 4: Run focused E2E**

Run: `scripts/e2e --grep "custom project switcher"`

Expected: PASS.

### Task 3: Update Existing Tests And Verify

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Replace native project select usage**

Update tests that call `#projectSelect` or `selectOption` for topbar project changes to use the helper and accessible state.

- [x] **Step 2: Run related E2E**

Run: `scripts/e2e --grep "project scoped sessions|custom project switcher|input reminder|ordinary user"`

Expected: PASS.

- [x] **Step 3: Run full verification**

Run: `scripts/verify && .githooks/pre-commit`

Expected: all checks pass.

- [x] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-project-switcher-design.md docs/superpowers/plans/2026-07-03-project-switcher.md e2e/project-management.spec.ts src/client/src/components/ProjectSwitcher.vue src/client/src/App.vue src/client/src/styles.css
git commit -m "feat: add custom project switcher"
```
