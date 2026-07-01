# Account Menu And Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-right account menu with password change, admin management, and logout actions.

**Architecture:** Reuse the existing Vue app and Express auth runtime. Add a self-password-change helper and endpoint, move admin/logout controls into a header menu, and keep management view routing client-side.

**Tech Stack:** Vue 3, Express, SQLite auth runtime, Node test runner, Playwright.

---

### Task 1: Add Password Change Tests

**Files:**
- Modify: `src/runtime/auth.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] Add a unit test showing `changeOwnPassword` rejects a wrong current password and leaves the old login valid.
- [x] Add a unit test showing `changeOwnPassword` accepts the current password and makes the new password valid.
- [x] Update E2E helpers to open admin management from the account menu.
- [x] Add E2E for `Change Password` through the account menu.
- [x] Run `scripts/test` and `scripts/e2e`; confirm failures are due to missing helpers/UI.

### Task 2: Implement Self Password Change API

**Files:**
- Modify: `src/runtime/auth.ts`
- Modify: `src/server/index.ts`

- [x] Implement `changeOwnPassword(userId, currentPassword, newPassword)`.
- [x] Add authenticated `POST /api/auth/password`.
- [x] Return `401` for wrong current password and `400` for invalid requests.
- [x] Run `scripts/test`.

### Task 3: Implement Account Menu UI

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] Add right-side account menu in workspace/admin headers.
- [x] Move `Admin Management` and `Log Out` actions into the menu.
- [x] Remove sidebar `Manage` and inline top-left logout.
- [x] Add password change modal and submit to `/api/auth/password`.
- [x] Keep admin management available only to admins.
- [x] Run `scripts/typecheck` and `scripts/e2e`.

### Task 4: Verify And Commit

**Files:**
- All changed files

- [x] Run `scripts/verify`.
- [x] Run `.githooks/pre-commit`.
- [x] Commit as `feat: add account menu and password change`.
