# User-Owned Sessions And Admin Session Management Design

## Goal

Keep ordinary users' TUI sessions out of the administrator Workspace while giving administrators a dedicated backend page to list, inspect, and delete all sessions.

## Requirements

- Workspace state remains user-scoped:
  - A session with `REMOTE_TUI_USER_ID` is visible only to the matching logged-in user.
  - Administrators still see their own sessions in Workspace.
  - Legacy ownerless sessions remain visible to administrators only.
- Admin backend adds a `Session Management` page.
- The admin session list includes session name, creator, creation time, agent, project, and status.
- Administrators can view a session's current details and buffer from the backend page.
- Administrators can delete any listed session from the backend page.
- Ordinary users cannot access the admin session list APIs or page.
- Browser clients must not receive raw internal env values or arbitrary command/path controls.

## Design

Use the server as the trust boundary. The existing `/api/state` and WebSocket state broadcasts keep user-scoped filtering. A new admin-only `/api/admin/sessions` endpoint returns a sanitized list derived from tuimux state. A new admin-only `/api/admin/sessions/:windowId` endpoint returns sanitized detail for one session. A new admin-only `DELETE /api/admin/sessions/:windowId` closes that window.

`createSessionEntry` records non-secret metadata in internal env: creator id/name, project id/name/path, agent id/name, and created timestamp. Public session state continues to omit env.

The frontend adds `AdminSessionsView.vue` under `/admin/sessions`. It fetches the admin list on mount, displays a table, opens a detail drawer for viewing, and calls delete with an inline refresh.

## Testing

Add an E2E regression that creates a normal user, creates a session as that user, logs back in as admin, verifies the session is absent from Workspace, then opens Session Management to verify the row shows session name, creator, creation time, agent, and can view/delete the session.
