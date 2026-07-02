# Page Routing Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce routed Workspace and Admin surfaces so workspace operations, admin management, and account actions live in clear product areas.

**Architecture:** Add Vue Router and keep `App.vue` as the authenticated shell and shared state owner. Extract route views and focused components from the current monolithic UI, preserving existing API/WebSocket behavior while changing page composition.

**Tech Stack:** Vue 3, Vue Router, Vite, TypeScript, Playwright E2E.

---

## File Structure

- `package.json`, `pnpm-lock.yaml`: Add `vue-router`.
- `src/client/src/main.ts`: Install router.
- `src/client/src/router.ts`: Define `/`, `/admin`, `/admin/projects`, `/admin/users`.
- `src/client/src/App.vue`: Shell, shared state, top bar, router-view props.
- `src/client/src/components/AccountMenu.vue`: Account dropdown.
- `src/client/src/components/ChangePasswordDialog.vue`: Password modal.
- `src/client/src/views/WorkspaceView.vue`: Workspace route.
- `src/client/src/views/AdminLayout.vue`: Admin frame with left management nav.
- `src/client/src/views/ProjectManagementView.vue`: Project management route.
- `src/client/src/views/UserManagementView.vue`: User management route.
- `src/client/src/styles.css`: Layout updates.
- `e2e/project-management.spec.ts`: Route and layout assertions.

### Task 1: Router Dependency and Failing Route Tests

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add Vue Router dependency**

Run:

```bash
pnpm add vue-router
```

Expected: `package.json` and `pnpm-lock.yaml` include `vue-router`.

- [x] **Step 2: Write failing E2E route/layout assertions**

Update `e2e/project-management.spec.ts` so admin management expects:

```ts
await expect(page).toHaveURL(/\/admin\/projects$/);
await expect(page.getByRole("navigation", { name: "Admin Management" })).toBeVisible();
await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
```

Update user management navigation to expect:

```ts
await page.getByRole("link", { name: "User Management" }).click();
await expect(page).toHaveURL(/\/admin\/users$/);
```

Add a direct-route ordinary user assertion:

```ts
await page.goto("/admin/projects");
await expect(page).toHaveURL(/\/$/);
await expect(page.getByRole("menuitem", { name: "Admin Management" })).toHaveCount(0);
```

- [x] **Step 3: Run focused E2E and verify RED**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "managed project|ordinary user"
```

Expected: FAIL because routes and admin layout do not exist yet.

### Task 2: Router Shell and Component Extraction

**Files:**
- Create: `src/client/src/router.ts`
- Create: `src/client/src/components/AccountMenu.vue`
- Create: `src/client/src/components/ChangePasswordDialog.vue`
- Modify: `src/client/src/main.ts`
- Modify: `src/client/src/App.vue`

- [x] **Step 1: Create router**

Create `src/client/src/router.ts` with route names:

```ts
import { createRouter, createWebHistory } from "vue-router";
import WorkspaceView from "./views/WorkspaceView.vue";
import AdminLayout from "./views/AdminLayout.vue";
import ProjectManagementView from "./views/ProjectManagementView.vue";
import UserManagementView from "./views/UserManagementView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "workspace", component: WorkspaceView },
    {
      path: "/admin",
      component: AdminLayout,
      children: [
        { path: "", redirect: "/admin/projects" },
        { path: "projects", name: "admin-projects", component: ProjectManagementView },
        { path: "users", name: "admin-users", component: UserManagementView }
      ]
    }
  ]
});
```

- [x] **Step 2: Install router in main**

Modify `src/client/src/main.ts`:

```ts
import { createApp } from "vue";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import App from "./App.vue";
import { router } from "./router";

window.__TYCHO_CLIENT__ = "vue-vite";

createApp(App).use(router).mount("#app");
```

- [x] **Step 3: Extract account menu**

Create `AccountMenu.vue` with props `currentUser` and emits `change-password`, `admin`, `logout`.

- [x] **Step 4: Extract password dialog**

Create `ChangePasswordDialog.vue` with props for open/busy/status/tone and emits `close` and `submit`.

- [x] **Step 5: Refactor App shell**

Keep auth and data functions in `App.vue`, render:

- Login shell when unauthenticated.
- `app-shell routed-shell` when authenticated.
- `header.app-topbar` with brand, route title, workspace project switcher only on `/`, and `AccountMenu`.
- `router-view` with shared props/actions.
- `ChangePasswordDialog`.

Add a watcher that redirects non-admin users away from `/admin`.

### Task 3: Workspace and Admin Views

**Files:**
- Create: `src/client/src/views/WorkspaceView.vue`
- Create: `src/client/src/views/AdminLayout.vue`
- Create: `src/client/src/views/ProjectManagementView.vue`
- Create: `src/client/src/views/UserManagementView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Create WorkspaceView**

Move workspace-only UI into `WorkspaceView.vue`:

- Connection status.
- Project path/description.
- Agent buttons.
- Session list.
- Workspace header.
- Terminal grid.

Expose event emits for create session, focus/close/focus pane, terminal host registration, and project persistence.

- [x] **Step 2: Create AdminLayout**

Create admin shell:

```html
<section class="admin-shell">
  <nav class="admin-sidebar" aria-label="Admin Management">
    <RouterLink to="/admin/projects">Project Management</RouterLink>
    <RouterLink to="/admin/users">User Management</RouterLink>
  </nav>
  <RouterView />
</section>
```

- [x] **Step 3: Create ProjectManagementView**

Move project form/delete/status UI into route view. Keep IDs used by E2E:

- `#projectForm`
- `#projectFormStatus`
- `#projectSelect`
- `#projectPath`
- `#projectDescription`

- [x] **Step 4: Create UserManagementView**

Move user creation/list/assignment UI into route view. Keep IDs and data attributes used by E2E:

- `#userFormStatus`
- `[data-user-row="..."]`
- `.user-status-message`

- [x] **Step 5: Update styles**

Adjust CSS for:

- `.routed-shell`
- `.app-topbar`
- `.workspace-layout`
- `.workspace-sidebar`
- `.admin-shell`
- `.admin-sidebar`
- `.admin-content`

Do not introduce a new visual palette.

### Task 4: Verification and Commit

**Files:**
- All changed files.

- [x] **Step 1: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [x] **Step 2: Run E2E**

Run:

```bash
scripts/e2e
```

Expected: PASS.

- [x] **Step 3: Run full verify**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 4: Update this plan**

Mark completed checkboxes and record any implementation notes.

- [x] **Step 5: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml src/client/src/main.ts src/client/src/router.ts src/client/src/App.vue src/client/src/components src/client/src/views src/client/src/styles.css e2e/project-management.spec.ts docs/superpowers/plans/2026-07-02-page-routing-refactor.md
git commit -m "feat: add routed workspace and admin layouts"
```

Expected: commit succeeds after verification.

### Task 5: List-First Admin CRUD

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-07-02-page-routing-refactor.md`
- Modify: `e2e/project-management.spec.ts`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/AdminLayout.vue`
- Modify: `src/client/src/views/ProjectManagementView.vue`
- Modify: `src/client/src/views/UserManagementView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Update spec and plan**

Record that admin pages are list-first CRUD screens with selectable tables, toolbar actions, and overlay/drawer forms.

- [x] **Step 2: Write failing E2E assertions**

Update `e2e/project-management.spec.ts` so project management and user management expect:

```ts
await expect(page.getByRole("table", { name: "Projects" })).toBeVisible();
await expect(page.getByRole("button", { name: "Edit Project" })).toBeDisabled();
await expect(page.getByRole("button", { name: "Delete Selected" })).toBeDisabled();
await expect(page.locator("#projectForm")).toHaveCount(0);
```

and:

```ts
await expect(page.getByRole("table", { name: "Users" })).toBeVisible();
await expect(page.getByRole("button", { name: "Edit User" })).toBeDisabled();
await expect(page.locator("#userFormStatus")).toHaveCount(0);
```

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "managed project|ordinary user|changes password|invalid project"
```

Expected: FAIL because the old admin screens still show persistent forms/cards first.

- [x] **Step 3: Implement project table CRUD**

Refactor `ProjectManagementView.vue` to show a project table, row checkboxes, toolbar buttons, and an Add/Edit drawer. Keep existing form/status/detail IDs used by E2E: `#projectForm`, `#projectFormStatus`, `#projectPath`, and `#projectDescription`.

- [x] **Step 4: Implement user table CRUD**

Refactor `UserManagementView.vue` to show a user table, row checkboxes, toolbar buttons, and Add/Edit drawer. Keep existing IDs/data hooks when the drawer is open: `#userFormStatus`, `[data-user-row="..."]`, and `.user-status-message`.

- [x] **Step 5: Add parent actions for selected rows**

Update `App.vue` and `AdminLayout.vue` so route views can delete selected projects, delete selected users, and toggle selected users by delegating to existing API calls.

- [x] **Step 6: Update admin table/drawer styles**

Add restrained backend styles for `.admin-toolbar`, `.admin-table`, `.admin-drawer`, `.row-actions`, and selected-row states without changing the product palette.

- [x] **Step 7: Run focused E2E**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "managed project|ordinary user|changes password|invalid project"
```

Expected: PASS.

- [x] **Step 8: Run verification**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 9: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md docs/superpowers/plans/2026-07-02-page-routing-refactor.md e2e/project-management.spec.ts src/client/src/App.vue src/client/src/views/AdminLayout.vue src/client/src/views/ProjectManagementView.vue src/client/src/views/UserManagementView.vue src/client/src/styles.css
git commit -m "feat: make admin management list first"
git push
```

### Task 6: Editable Managed Projects

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-07-02-page-routing-refactor.md`
- Modify: `src/runtime/config.test.ts`
- Modify: `src/runtime/config.ts`
- Modify: `src/server/index.ts`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/AdminLayout.vue`
- Modify: `src/client/src/views/ProjectManagementView.vue`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Update spec and plan**

Record that managed project editing is now in scope and requires a server API.

- [x] **Step 2: Write failing tests**

Add runtime tests for `updateManagedProject`, and E2E coverage that edits a managed project's name, path, and description from the Project Management drawer.

Expected RED:

```bash
scripts/test
# FAIL: config.js does not export updateManagedProject

pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
# FAIL: edit fields are readonly / no save action
```

- [x] **Step 3: Implement runtime update**

Add `updateManagedProject(projectId, input)` in `src/runtime/config.ts`. It should:

- Return `null` when `projectId` is not a managed project.
- Trim supplied values.
- Validate non-empty name and path when provided.
- Resolve and validate path directories.
- Reject duplicate paths owned by another project.
- Persist `name`, `path`, `description`, and `updated_at`.

- [x] **Step 4: Implement admin API route**

Add `PATCH /api/projects/:projectId` in `src/server/index.ts`, guarded by `requireAdmin`, returning `404` for non-managed/missing projects and `{ project, config }` for updates.

- [x] **Step 5: Wire frontend edit save**

Add `updateProjectForm(projectId)` in `App.vue`, forward it through `AdminLayout.vue`, and make `ProjectManagementView.vue` edit drawer inputs editable with a Save Project action.

- [x] **Step 6: Verify focused tests**

Run:

```bash
scripts/test
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
```

Expected: PASS.

- [x] **Step 7: Run full verification**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 8: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md docs/superpowers/plans/2026-07-02-page-routing-refactor.md src/runtime/config.test.ts src/runtime/config.ts src/server/index.ts src/client/src/App.vue src/client/src/views/AdminLayout.vue src/client/src/views/ProjectManagementView.vue e2e/project-management.spec.ts
git commit -m "feat: support editing managed projects"
git push
```

### Task 7: Hide Internal Project Source Metadata

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-07-02-page-routing-refactor.md`
- Modify: `e2e/project-management.spec.ts`
- Modify: `src/client/src/views/ProjectManagementView.vue`

- [x] **Step 1: Update spec and plan**

Record that Project Management should not show the internal `managed` source flag as a visible table column. The app should still use it internally to protect configured projects.

- [x] **Step 2: Write failing E2E assertion**

Update `e2e/project-management.spec.ts` so Project Management expects no `Managed` column header.

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
```

Expected: FAIL because the current table still renders the `Managed` header.

- [x] **Step 3: Remove visible Managed column**

Update `ProjectManagementView.vue` to remove the `Managed` table header and cell while keeping `project.managed` for edit/delete permission checks.

- [x] **Step 4: Verify**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
scripts/verify
```

Expected: PASS.

- [x] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md docs/superpowers/plans/2026-07-02-page-routing-refactor.md e2e/project-management.spec.ts src/client/src/views/ProjectManagementView.vue
git commit -m "fix: hide internal project source column"
git push
```

### Task 8: Remove Redundant Selected Project Summary

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-07-02-page-routing-refactor.md`
- Modify: `e2e/project-management.spec.ts`
- Modify: `src/client/src/views/ProjectManagementView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Update spec and plan**

Record that Project Management should not render the separate selected-project summary block below the table. Path and description stay visible in the table row and edit drawer.

- [x] **Step 2: Write failing E2E assertion**

Update `e2e/project-management.spec.ts` so selecting or editing a project expects no `Selected Path` or `Selected Description` summary, while still verifying path and description in the project table row.

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
```

Expected: FAIL because the current page still renders the selected-project summary.

- [x] **Step 3: Remove selected summary UI**

Update `ProjectManagementView.vue` to remove the summary block below the table. Remove unused `.selection-summary` styles from `src/client/src/styles.css`.

- [x] **Step 4: Verify**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
scripts/verify
```

Expected: PASS.

- [x] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-07-02-page-routing-refactor-design.md docs/superpowers/plans/2026-07-02-page-routing-refactor.md e2e/project-management.spec.ts src/client/src/views/ProjectManagementView.vue src/client/src/styles.css
git commit -m "fix: remove selected project summary"
git push
```
