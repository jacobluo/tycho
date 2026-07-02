# Remove Terminal Focus Button Design

## Goal

Remove the redundant `Focus` button from each terminal card header.

## Context

Clicking a terminal card or terminal host already focuses that session. The explicit `Focus` button duplicates the same behavior and takes space next to the more important `Close` action.

## Requirements

- Terminal cards no longer render a `Focus` button.
- Clicking the terminal card or terminal host still focuses the pane.
- The terminal card header keeps the `Close` button.
- Sidebar session click focus remains unchanged.

## Testing

- Playwright creates a named session and verifies its terminal card has no `Focus` button and still has `Close`.

## Out of Scope

- Changing session focus semantics.
- Changing sidebar session list behavior.
- Changing keyboard shortcuts.
