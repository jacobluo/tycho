# Admin Management Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move administrator project and user management into a dedicated admin interface with `Project Management` and `User Management` tabs.

**Architecture:** Keep the existing Vue single-file app and server API contracts. Add lightweight client view state for `workspace` versus `manage`, add an admin tab state, and relocate existing project/user forms from the sidebar into the management workspace.

**Tech Stack:** Vue 3, Vite, Playwright, existing Express auth/RBAC APIs.

---

### Task 1: Update E2E To Require The New Admin Surface

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] Add an admin helper that clicks `Manage`.
- [x] Update project creation/deletion tests to use `Project Management`.
- [x] Update user creation/assignment tests to use `User Management`.
- [x] Assert the runtime sidebar no longer contains inline `Add Project` or `Users` management sections.
- [x] Run `scripts/e2e` and confirm failures are due to the missing `Manage` UI.

### Task 2: Move Admin Controls Into A Dedicated Vue View

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] Add `activeView` state with `workspace` and `manage`.
- [x] Add `adminTab` state with `projects` and `users`.
- [x] Add a sidebar navigation block with `Workspace` and admin-only `Manage`.
- [x] Remove inline project management and user management sections from the sidebar.
- [x] Add a management workspace branch with `Project Management` and `User Management` tabs.
- [x] Keep existing project/user API methods and status messages.

### Task 3: Verify And Commit

**Files:**
- All changed files

- [x] Run `scripts/typecheck`.
- [x] Run `scripts/e2e`.
- [x] Run `scripts/verify`.
- [x] Run `.githooks/pre-commit`.
- [x] Commit as `feat: add dedicated admin management view`.
