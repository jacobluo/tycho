# Project-Scoped Sessions Design

## Context

Tycho already creates each TUI session from the currently selected project. The server stores that project identity in the internal session entry environment as `REMOTE_TUI_PROJECT_ID`, `REMOTE_TUI_PROJECT_NAME`, and `REMOTE_TUI_PROJECT_PATH`. The browser currently receives panes and windows without safe project metadata, so it shows every visible server-side TUI regardless of the selected project.

The desired behavior is view filtering, not lifecycle control: switching projects must not close or restart any TUI session.

## User Experience

When the workspace project selector changes, the Sessions list and terminal slot area show only sessions whose project id matches the selected project. Sessions from other projects continue running on the server and reappear when the user switches back to their project. Creating a session still uses the currently selected project.

If the selected project has no visible sessions, the workspace shows the normal empty state. If current slot assignments point at sessions from another project, those assignments are ignored for the current project view and preserved only as raw local state until the user returns to that project.

Slot session dropdowns list only sessions from the selected project. Clicking a session in the sidebar can only focus or display sessions from the current project because the sidebar itself is filtered.

## Data Model

Expose safe project metadata on `PublicAgentEntry`:

- `projectId?: string`
- `projectName?: string`
- `projectPath?: string`

These fields are derived from the internal entry env keys and do not expose arbitrary environment variables or secrets. `env` remains stripped from public state.

## Frontend Architecture

Add small helper functions in `src/client/src/App.vue`:

- `paneProjectId(pane)` returns `pane.entry.projectId`, falling back to matching `pane.entry.projectPath` or `pane.entry.cwd` against configured project paths for restored sessions created before project metadata existed.
- `windowProjectId(windowState)` finds the window active pane and returns its project id.
- `windowMatchesSelectedProject(windowState)` compares that project id with `selectedProjectId`.

Add `projectWindows`, `projectPanes`, and `projectState` computed values. Pass `projectState` to `WorkspaceView` so the component renders only current-project sessions without needing to know about global server state. Keep full `state` in `App.vue` for permission-filtered server truth and for restoring sessions when switching back.

Make `syncSlotAssignments` operate on current-project windows only. It should prune slot assignments against current project live window ids, fill empty visible slots from current project sessions, and keep active slot selection within the current project view. Closing a session still clears global slot assignment for that window and sends the existing close request.

## Security

Do not expose internal env objects. Only copy the three project metadata values that Tycho created itself. Server-side user filtering remains unchanged: admins can receive all sessions, normal users only receive their own sessions, and the browser additionally filters by selected project.

## Testing

Add unit coverage that public session entries expose project metadata while still omitting `env`. Add E2E coverage for creating sessions in two projects, switching the project selector, and confirming only the current project session appears while the other session reappears after switching back.

Full verification must run `scripts/verify` and `.githooks/pre-commit` before completion.
