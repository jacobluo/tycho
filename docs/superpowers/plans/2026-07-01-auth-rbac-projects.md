# Authentication And Project RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password login, admin/user roles, and project assignment so normal users can only access projects assigned by administrators.

**Architecture:** Store users, sessions, and project assignments in the existing local SQLite database under `.tuimux/`. Add runtime auth helpers for password hashing, session cookies, soft deletion, and project permission checks. Gate Express HTTP and WebSocket routes by session cookie, filter project config by role/assignment, and make the Vue client render a login view, admin-only project and user management, and assignment controls.

**Tech Stack:** Node `crypto` scrypt, SQLite via `node:sqlite`, Express, WebSocket `ws`, Vue 3, Vite, Playwright, Node test runner.

---

### Task 1: Add Red Unit And E2E Tests

**Files:**
- Create: `src/runtime/auth.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] Add auth unit tests for bootstrap admin, login failure, login success, session lookup, user creation, and project assignment.
- [x] Add auth unit tests for password update, role update, disable/enable, and soft delete.
- [x] Add E2E coverage for admin login, creating a user, assigning a project, ordinary user login, and denied project management.
- [x] Run `scripts/test` and `scripts/e2e`; confirm failures are due to missing auth APIs/UI.

### Task 2: Implement Auth Runtime

**Files:**
- Create: `src/runtime/auth.ts`
- Modify: `src/runtime/config.ts`

- [x] Create SQLite tables `users`, `sessions`, and `project_assignments`.
- [x] Implement salted scrypt password hashing and verification.
- [x] Implement bootstrap admin creation.
- [x] Implement login/session/logout helpers.
- [x] Implement user creation, password update, role update, disable/enable, soft delete, and assignment helpers.
- [x] Implement project filtering and access checks.
- [x] Run focused unit tests and confirm they pass.

### Task 3: Gate Server APIs And WebSocket

**Files:**
- Modify: `src/server/index.ts`

- [x] Add cookie parsing and session authentication middleware.
- [x] Add `/api/auth/me`, `/api/auth/login`, and `/api/auth/logout`.
- [x] Add admin-only `/api/users` and `/api/users/:userId/projects`.
- [x] Add admin-only user update, password update, status update, and soft delete APIs.
- [x] Require auth for `/api/config`, `/api/state`, sessions, project APIs, and WebSocket.
- [x] Filter public config projects by current user role/assignments.
- [x] Enforce project access before session creation.

### Task 4: Update Vue Client

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] Add login view and logout action.
- [x] Load current auth state before connecting WebSocket.
- [x] Hide project management controls from ordinary users.
- [x] Add admin user creation, password/role/status/delete, and project assignment controls.
- [x] Keep existing xterm/session/project behavior for authorized projects.

### Task 5: Verify And Commit

**Files:**
- All changed files

- [x] Run `scripts/test`.
- [x] Run `scripts/e2e`.
- [x] Run `scripts/verify`.
- [x] Run `.githooks/pre-commit`.
- [x] Commit as `feat: add login and project rbac`.
