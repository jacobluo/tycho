# TUI Input Reminders Design

## Context

Tycho can show multiple server-side TUI agent sessions at once. When an agent finishes a turn and waits for the user, the only current signal is inside the terminal itself. That is easy to miss when the session is hidden in another slot or only listed in the sidebar.

This feature adds a frontend-only visual reminder for sessions that appear to be waiting for user input. It must not send commands, move focus, change active slots, close sessions, or expose additional server data.

## Detection

The backend does not currently emit a first-class `waiting_for_input` event. The first version therefore uses a conservative client-side heuristic based on each pane buffer:

- only running panes can be marked as waiting;
- ANSI/control sequences are stripped before matching;
- the recent tail of the buffer is inspected;
- common agent input prompts are matched, including prompt glyph lines such as `>`, `›`, `❯`, and question/confirmation endings such as `?`, `？`, `[y/N]`, `(y/n)`, `Type ... to confirm`, and `Press Enter`.

This is intentionally best-effort. False negatives are acceptable; false positives should be quiet because the reminder is visual only.

## UI Behavior

When a pane is waiting for input:

- its sidebar session row gets an `input-waiting` class and a small `Needs input` badge;
- its terminal card gets an `input-waiting` class and a `Needs input` badge in the title bar;
- the card and row use a warm amber accent that works in both Dark and Light interface styles;
- the reminder does not steal focus or reorder slots.

When new pane output arrives that no longer looks like a prompt, the reminder disappears automatically.

## State Flow

`App.vue` keeps the existing tuimux state as the source of truth, but it also updates the matching local `state.panes[].buffer` when a `pane_output` WebSocket message arrives. That keeps computed reminder state live without waiting for another snapshot.

A shared helper in `src/shared/tui-input-state.ts` owns the matching logic. The Vue app computes waiting pane/window ids from that helper and passes them into `WorkspaceView.vue`.

## Testing

Add unit tests for the helper:

- detects prompt glyph lines;
- detects English and Chinese questions;
- detects confirmation prompts;
- ignores stopped panes and ordinary non-prompt output.

Add Playwright coverage that injects a test state containing a waiting pane and verifies both sidebar and terminal card reminders render without changing focus/slot selection.

Full verification still runs `scripts/verify` and `.githooks/pre-commit`.
