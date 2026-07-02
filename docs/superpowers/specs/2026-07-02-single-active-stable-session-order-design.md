# Single Active Stable Session Order Design

## Goal

Fix the workspace session selection regression:

- Only one session should look selected at a time.
- Clicking a left Sessions item should select/focus that session without leaving another session highlighted.
- Clicking a terminal card should select/focus that session without moving the card in the grid.
- Server/client snapshots and focus updates must preserve the user's existing card order.

## Root Cause

The UI currently treats two different concepts as the same selected state:

- `state.activeWindowId`, reported asynchronously by tuimux.
- `activePaneId`, tracked locally when xterm focus changes.

When they temporarily point at different sessions, the `WorkspaceView` `active` class uses an `OR` condition and paints both as selected.

Window order is preserved for `window_changed`, but a future `snapshot` or browser-side state replacement can still replace `state.windows` with whatever order arrives over the socket. Focus events should update selection, not reorder the visual list.

## Design

- Add one derived UI selection value: `selectedWindowId`.
- Resolve it from the locally focused pane first, then server active pane/window as fallback.
- Update both sidebar and terminal card active classes to use only `selectedWindowId`.
- When selecting from the sidebar, update local `activePaneId` immediately before focusing xterm.
- Preserve existing window order when applying both tuimux snapshots and browser websocket state updates.

## Testing

- Unit test: snapshot window data preserves existing window order while replacing window details.
- E2E: create multiple sessions, click the left Sessions list and terminal cards, assert exactly one sidebar item is active and terminal card order remains unchanged.

## Out of Scope

- Changing tuimux server focus semantics.
- Changing terminal input routing.
- Changing close confirmation behavior.
