# Admin Management Interface Design

## Goal

Move administrator-only project and user management out of the operational sidebar into a dedicated admin interface.

## Current Problem

The current admin controls live in the left sidebar beside project selection, agent launch, and session navigation. This keeps the first implementation small, but the sidebar becomes crowded and the management workflows feel like settings pasted into the runtime console.

## Design

Authenticated users keep the same main workspace:

- Left sidebar shows connection state, current user, selected project, agent launch buttons, and sessions.
- The terminal workspace remains focused on server-side TUI sessions.
- Admin-only controls are not shown inline in the sidebar.

Administrators see a `Manage` entry in the sidebar. Selecting it opens a separate management surface in the main workspace area.

The management surface contains two tabs:

- `Project Management`: project list, project creation form, selected project details, and deletion for managed projects.
- `User Management`: user creation, role/password/status controls, soft delete, and project assignment.

Ordinary users do not see the `Manage` entry and cannot reach management controls through the UI. Existing server-side authorization remains the source of truth for project/user APIs.

## Behavior

- Admin users can switch between `Workspace` and `Manage` without logging out.
- Opening `Manage` defaults to `Project Management`.
- Project creation still updates the runtime project selector and can select the newly created project.
- Project deletion remains restricted to managed projects.
- User management loads only for admins after authentication and remains hidden for ordinary users.
- Ordinary users with no management permissions see only the operational workspace.

## Testing

- Update Playwright coverage so project creation/deletion happens through `Manage` -> `Project Management`.
- Update Playwright coverage so user creation/assignment happens through `Manage` -> `User Management`.
- Assert admin management controls are absent from the operational sidebar.
- Assert ordinary users do not see the `Manage` entry and cannot access admin controls.
