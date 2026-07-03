# User-Owned Sessions And Admin Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate Workspace sessions by owner while adding an admin backend page for all-session list, view, and delete.

**Architecture:** Keep ordinary `/api/state` and WebSocket state filtered by owner. Add admin-only session list/detail/delete APIs that return sanitized tuimux metadata. Add a Vue admin view at `/admin/sessions` that fetches these APIs directly.

**Tech Stack:** TypeScript, Express, ws, Vue 3, Playwright E2E.

---

### Task 1: Regression Coverage

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add failing E2E test**

Add a test named `user session isolation: admin manages ordinary user sessions from backend only`. It creates a normal user, starts a session as that user, verifies the admin Workspace does not show it, then verifies the admin Sessions backend can list, view, and delete it.

- [x] **Step 2: Run focused E2E**

Run: `scripts/e2e --grep "user session isolation"`

Expected: FAIL because the Workspace is not yet owner-filtered and the admin Sessions page/API do not exist.

### Task 2: Server-Side Session APIs

**Files:**
- Modify: `src/runtime/config.ts`
- Modify: `src/server/index.ts`
- Modify: `src/client/src/client-types.ts`

- [x] **Step 1: Store session metadata**

Add `REMOTE_TUI_AGENT_ID`, `REMOTE_TUI_AGENT_NAME`, and `REMOTE_TUI_CREATED_AT` to `createSessionEntry` env.

- [x] **Step 2: Fix Workspace visibility**

When `REMOTE_TUI_USER_ID` exists, only the owner sees the pane. When owner is missing, only admins see it.

- [x] **Step 3: Add admin session APIs**

Add admin-only list, detail, and delete endpoints returning sanitized session metadata and buffer.

- [x] **Step 4: Run focused E2E**

Run: `scripts/e2e --grep "user session isolation"`

Expected: FAIL until the frontend route exists, then PASS.

### Task 3: Admin Session Management UI

**Files:**
- Modify: `src/client/src/router.ts`
- Modify: `src/client/src/views/AdminLayout.vue`
- Create: `src/client/src/views/AdminSessionsView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Add route and navigation**

Add `/admin/sessions` and a `Session Management` link in the admin sidebar.

- [x] **Step 2: Add sessions view**

Render a table with session name, creator, created time, agent, project, status, and actions. Add a detail drawer for View and a delete action.

- [x] **Step 3: Style using existing admin table/drawer patterns**

Reuse `admin-table`, `admin-toolbar`, and `admin-drawer` conventions.

- [x] **Step 4: Run focused E2E**

Run: `scripts/e2e --grep "user session isolation"`

Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-user-owned-sessions.md`

- [x] **Step 1: Run related E2E**

Run: `scripts/e2e --grep "user session isolation|ordinary user|project scoped sessions|input reminder"`

Expected: PASS.

- [x] **Step 2: Run full checks**

Run: `scripts/verify && .githooks/pre-commit`

Expected: all checks pass.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-user-owned-sessions-design.md docs/superpowers/plans/2026-07-03-user-owned-sessions.md e2e/project-management.spec.ts src/runtime/config.ts src/server/index.ts src/client/src/client-types.ts src/client/src/router.ts src/client/src/views/AdminLayout.vue src/client/src/views/AdminSessionsView.vue src/client/src/styles.css
git commit -m "feat: add admin session management"
```
