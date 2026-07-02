# Session Close and Focus Polish Design

## Goal

Polish session closing and focus behavior in the workspace:

- Closing a session uses an in-app confirmation dialog, not the browser native confirm.
- Focusing a session/window does not move that terminal card to the far right.
- The left Sessions list visually marks the current active session.

## Root Cause

`TuimuxClient.applyMessage("window_changed")` currently removes the existing window and appends the changed window to the end of `state.windows`. When focusing a window causes tuimux to emit `window_changed`, Vue renders the focused card at the end of the grid.

Session close currently sends `close_window` immediately. The browser-native confirms still exist in project/user management, but workspace session close has no in-app confirmation surface.

## UX Requirements

- Clicking a terminal card `Close` or a left Sessions `Close` opens a Tycho-styled modal.
- The modal shows the session title and has `Cancel` and `Close Session`.
- `Cancel` dismisses without closing.
- `Close Session` sends the existing close-window action and dismisses the modal.
- No `window.confirm()` is used for session close.
- The terminal card order stays stable when focusing a session.
- The active left Sessions item uses the same accent language as active terminal cards.

## Testing

- Unit test verifies `window_changed` preserves existing window order.
- Playwright verifies session close uses the custom dialog and does not call native dialog.
- Playwright verifies the active session item in the left list has an active class.

## Out of Scope

- Changing project/user delete confirmations.
- Changing tuimux internals beyond preserving Tycho client state order.
- Changing how terminal input focus works.
