# Tuimux Shutdown Design

## Goal

Prevent Tycho-owned tuimux and agent processes from lingering after the Tycho server process exits.

## Root Cause

Tycho starts tuimux as a detached server process through `TuimuxClient.start()`. The current server only handles `SIGINT`, and that handler closes the HTTP server without calling `tuimux.shutdown()`. Playwright and local dev process managers commonly stop the server with `SIGTERM`, so detached tuimux servers survive and keep their CodeBuddy child processes running.

Process inspection confirmed orphaned tuimux servers under `.playwright-mcp/tuimux-*` with `node /opt/homebrew/bin/codebuddy` children.

## Requirements

- Tycho shutdown must call `tuimux.shutdown()` before exiting.
- Shutdown must run for both `SIGINT` and `SIGTERM`.
- Shutdown must close active WebSocket clients and the WebSocket server.
- Shutdown must close the HTTP server.
- Shutdown must be idempotent so duplicate signals do not run cleanup twice.
- Tuimux must stay attached to Tycho's process group so process managers can terminate it with Tycho.
- Playwright must start the Node server directly instead of through `pnpm run dev` so the server receives lifecycle signals predictably.
- Existing session close behavior remains unchanged; this fix targets server process lifecycle.

## Testing

- Add a unit test for the shutdown helper that verifies WebSocket clients close, HTTP/WebSocket servers close, and `tuimux.shutdown()` is called.
- Add a unit test that duplicate shutdown calls only execute cleanup once.

## Out of Scope

- Changing tuimux's internal `close_window` semantics.
- Killing arbitrary user CodeBuddy or WorkBuddy processes.
- Changing the browser session close UI.
