# Page Routing Refactor Design

## Context

Tycho currently mixes workspace, admin, and account actions inside one large Vue screen. The left sidebar stays visible even when users are doing admin work, and account actions such as password changes sit too close to management controls.

The desired product shape is clearer:

- The workspace is the main business surface for running server-side TUI sessions.
- Admin management is a separate routed area with its own management navigation.
- Account actions live in the top-right user menu.

## Goals

- Introduce Vue Router for top-level application navigation.
- Make `/` the workspace route.
- Make `/admin/projects` and `/admin/users` admin routes.
- Keep account actions in the top-right account menu.
- Remove workspace-specific sidebar chrome from admin pages.
- Split the current monolithic `App.vue` into focused components and views.
- Preserve existing auth, project management, user management, session, xterm, and password-change behavior.

## Non-Goals

- Do not redesign the visual system from scratch.
- Do not add new admin domains beyond project and user management.
- Do not change RBAC semantics.
- Do not introduce a new UI component library.

## Information Architecture

Routes:

- `/`: Workspace.
- `/admin`: Redirects to `/admin/projects`.
- `/admin/projects`: Admin layout with Project Management active.
- `/admin/users`: Admin layout with User Management active.

Top-level shell:

- Persistent top bar after login.
- Top bar contains brand, route context, optional project switcher on workspace routes, and account menu.
- Account menu contains Change Password, Admin Management for admins, and Log Out.

Workspace route:

- Shows business controls for project selection, agent launch, session list, and terminal grid.
- It does not show admin management forms.

Admin routes:

- Use an admin layout with a left admin navigation rail.
- Left rail contains Project Management and User Management.
- Right content area is list-first: the primary surface is a selectable table, not a persistent create form.
- Project Management shows a project table first, with toolbar actions for Add, Edit, and Delete.
- User Management shows a user table first, with toolbar actions for Add, Edit, Enable/Disable, and Delete.
- Add and edit actions open a focused overlay/drawer so the user can keep table context.
- Project Management does not expose internal `managed` source metadata as a table column; edit/delete availability communicates what the admin can do.
- It does not show the workspace agent/session/terminal sidebar.

## Component Plan

`App.vue` becomes the authenticated shell and shared state owner. It keeps API/WebSocket/session state orchestration, then passes state and actions to route components.

New focused components:

- `AccountMenu.vue`: current user menu, admin navigation action, password dialog trigger, logout.
- `ChangePasswordDialog.vue`: password form modal.
- `WorkspaceView.vue`: workspace route composition.
- `AdminLayout.vue`: admin route frame and admin navigation.
- `ProjectManagementView.vue`: project CRUD UI.
- `UserManagementView.vue`: user CRUD and project assignment UI.

The refactor can keep state and API functions in `App.vue` for this slice. Moving those into composables is allowed only if it reduces complexity without changing behavior.

## Interaction Rules

- Ordinary users cannot navigate to admin pages. If they reach an admin route directly, the app returns them to `/`.
- Admin users can enter admin management from the account menu.
- The project switcher is visible on workspace routes and hidden on admin routes unless a future admin workflow needs it.
- Change Password remains a modal launched from the account menu.
- Log Out remains an account menu action.
- Admin list checkboxes support multi-select.
- Edit is enabled only when exactly one row is selected.
- Managed project editing updates project name, local path, and description through an admin-only server API.
- Delete supports one or more selected rows, but non-managed base projects remain protected internally.
- User project assignment lives in the user edit overlay, not as always-visible controls on every user row.

## Testing

E2E coverage should verify:

- Workspace route shows agent/session controls and terminal area.
- Admin management opens from the account menu.
- Project Management and User Management live under admin routes with admin navigation.
- Admin pages do not show workspace agent/session sidebar controls.
- Ordinary users do not see Admin Management in the account menu and cannot use admin routes.
- Existing project create/delete, user create/assign, and password change flows still work.
- Project and user management pages open to tables before any form.
- Selecting rows enables the appropriate toolbar actions.
- Add/edit forms appear only after the user chooses an action.
- Project edit persists updated name, path, and description and rejects duplicate or invalid paths.

Typecheck and full verification must pass before completion.
