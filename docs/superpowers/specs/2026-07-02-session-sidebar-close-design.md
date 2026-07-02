# Session Sidebar Close Design

## Goal

Add a close control to each item in the left Sessions list so users can close a session without moving to the terminal card header.

## Product Context

Tycho's workspace is an operator console for server-side TUI agents. The left sidebar is the fast navigation surface; session lifecycle controls should be available there when a user is scanning active sessions.

## Frontend Design Direction

- Keep the existing dark console palette and compact spacing.
- Put a small `Close` button inside each real session item.
- Keep the session title/status/path readable and truncated.
- Clicking the session item still focuses the session.
- Clicking the close button closes the session and must not also trigger focus.

## Requirements

- Empty state remains `No sessions` and does not show a close button.
- Each active session item shows one close button with an accessible label that includes the session title.
- The close button emits the existing `close-window` event with that session's window id.
- The close button uses `.stop` click behavior so it does not bubble to the session row focus handler.

## Testing

- Playwright creates a named session, finds it in the left Sessions list, clicks its close button, and verifies both the sidebar item and terminal card disappear.

## Out of Scope

- Confirmation dialogs for session close.
- Bulk session management.
- Changing tuimux close semantics.
