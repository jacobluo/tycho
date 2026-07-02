# Interface Style Switch Design

## Context

Tycho currently has one dark operational interface. The requested visual direction references a light Codex-style reading surface: a translucent gray sidebar, warm paper content, quiet dividers, compact top navigation, and rounded active rows.

This feature adds a frontend-only style switch. It must not change authentication, project management, TUI lifecycle, session routing, or server behavior.

## Design Direction

Add a two-option style switch in the top bar:

- `Dark`: the current Tycho look.
- `Reader`: a screenshot-inspired light style.

The selected style persists in `localStorage` and applies immediately. The switch is visible after login because it controls the application shell, not the login screen.

## Reader Theme Tokens

Reader uses a deliberate warm-neutral palette rather than a generic white dashboard:

- `Paper`: `#f7f5ef` for the main application surface.
- `Fog rail`: `rgba(210, 207, 208, 0.82)` for the left navigation region.
- `Ink`: `#2d2b27` for primary text.
- `Soft ink`: `#77736d` for secondary labels.
- `Hairline`: `#dedbd3` for separators.
- `Mint signal`: `#23c86b` for connected state and small status emphasis.

The aesthetic risk is the translucent sidebar and quiet off-white terminal chrome around a still-dark TUI. This keeps the server-side terminal readable while making the rest of the app feel like a calm reading workspace.

## UI Behavior

The top bar gets a compact segmented control labelled for accessibility as `Interface style`. Switching to Reader sets an attribute on the app shell, such as `data-interface-style="reader"`. Switching back sets `data-interface-style="dark"`.

Reader style changes:

- application background to warm paper;
- top bar and workspace header to light surfaces;
- left workspace/sidebar surfaces to translucent fog;
- session rows to light rounded rows with a softer active state;
- buttons, inputs, selects, menus, modals, and management tables to light variants;
- terminal content remains dark for TUI readability.

## Testing

Add Playwright coverage that logs in, switches to Reader, verifies the app shell attribute and persisted `localStorage` value, reloads, verifies Reader persists, then switches back to Dark and verifies the original style attribute returns.

Add a lightweight source-level regression test that ensures the Reader theme CSS selectors exist. Full verification still runs `scripts/verify` and `.githooks/pre-commit`.
