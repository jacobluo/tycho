# Workspace Interactions Design

## Goal

Fix three workspace interaction issues without changing Tycho's core architecture:

- The account menu closes when the user clicks outside it.
- Starting an agent asks for a single session name before the session is created.
- Clicking a terminal window focuses input without moving the window position.

## Product Context

Tycho is a browser-based observatory for server-side TUI coding agents. The workspace should feel like an operator console: compact, stable, and predictable while multiple terminal panes are running.

## Frontend Design Direction

- Palette: keep the existing console palette `#0f1115`, `#171a21`, `#1d222b`, `#343c49`, `#4fb8ff`, and `#eef2f7`.
- Type: keep the existing system sans stack for controls and the xterm monospace stack for terminal content.
- Layout: keep the topbar/sidebar/workspace structure. Add only a focused modal for naming sessions.
- Signature: stability is the visual behavior. Windows should not jump when selected, and menus should behave like native application menus.

## Requirements

### Account Menu

- Clicking the account trigger toggles the menu.
- Clicking inside the menu keeps it open unless a menu command is chosen.
- Clicking elsewhere in the document closes the menu.
- Pressing Escape closes the menu.

### Session Naming

- Clicking an agent launcher opens a modal dialog instead of immediately creating a session.
- The modal contains exactly one user-entered value: session name.
- The primary action sends the existing `create_session` WebSocket message with `agentId`, `projectId`, and trimmed `label`.
- Empty names are not submitted.
- Canceling or closing the modal does not create a session.

### Terminal Focus

- Clicking a terminal card marks its pane active and focuses the xterm input.
- Focusing a terminal does not call `scrollIntoView` or otherwise reposition the window.
- Clicking terminal action buttons still runs their specific command.

## Testing

- Playwright covers account menu outside-click behavior.
- Playwright covers the session naming modal and verifies the submitted WebSocket payload includes the label.
- Playwright covers that selecting an existing session/window does not scroll the terminal grid.
- Playwright uses an isolated tuimux home so local long-running sessions cannot pollute E2E state.

## Out of Scope

- No change to agent allowlisting.
- No change to tuimux session persistence.
- No redesign of the management screens.
