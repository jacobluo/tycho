# Terminal Fit Resize Design

## Goal

Fix intermittent TUI reflow where terminal content appears to jump upward or wrap unexpectedly after layout changes.

## Root Cause

The browser terminal currently estimates columns and rows with fixed constants:

```ts
cols = Math.floor((width - 16) / 7.8)
rows = Math.floor((height - 16) / 15.4)
```

After slot layouts, terminal containers change size more often. Hard-coded cell measurements can drift from the actual xterm font metrics. When Tycho sends mismatched `cols` and `rows` to the backend PTY, full-screen TUI apps reflow to the wrong size and then jump when the browser and PTY sizes disagree.

## Design

Use `@xterm/addon-fit` so xterm computes dimensions from its actual rendered cell size.

Behavior:

- Load one `FitAddon` per `TerminalRecord`.
- Call `fitAddon.fit()` after mount and on `ResizeObserver`.
- Send backend resize using `term.cols` and `term.rows`.
- Only send a resize message when cols or rows changed.
- Keep the existing xterm lifecycle: dispose the addon with the terminal through `term.dispose()`.

## Testing

- Add a focused E2E regression that intercepts websocket resize messages after changing session layout and asserts resize messages remain valid and nonzero.
- Add a source-level regression check that the client uses `@xterm/addon-fit` and no longer uses the previous hard-coded `7.8`/`15.4` terminal cell estimates.

## Out of Scope

- Changing terminal themes or fonts.
- Changing tuimux backend resize semantics.
- Changing slot layout behavior.
