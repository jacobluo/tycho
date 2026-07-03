# Interface Style Switch Design

## Context

Tycho currently has one dark operational interface. The requested visual direction references a light Codex-style reading surface: a translucent gray sidebar, warm paper content, quiet dividers, compact top navigation, and rounded active rows.

This feature adds a frontend-only style switch. It must not change authentication, project management, TUI lifecycle, session routing, or server behavior.

## Design Direction

Add a two-option style switch in the top bar:

- `Dark`: the current Tycho look.
- `Light`: a screenshot-inspired light style.

The selected style persists in `localStorage` and applies immediately. The switch is visible after login because it controls the application shell, not the login screen.

## Light Theme Tokens

Light uses a deliberate warm-neutral palette rather than a generic white dashboard:

- `Paper`: `#f7f5ef` for the main application surface.
- `Fog rail`: `rgba(210, 207, 208, 0.82)` for the left navigation region.
- `Ink`: `#2d2b27` for primary text.
- `Soft ink`: `#77736d` for secondary labels.
- `Hairline`: `#dedbd3` for separators.
- `Mint signal`: `#23c86b` for connected state and small status emphasis.

The aesthetic risk is the translucent sidebar plus a fully light TUI surface. The terminal should read like a command transcript on paper in Light mode: white background, dark text, and a blue cursor/selection accent.

## UI Behavior

The top bar gets a compact segmented control labelled for accessibility as `Interface style`. Switching to Light sets an attribute on the app shell, such as `data-interface-style="light"`. Switching back sets `data-interface-style="dark"`.

Light style changes:

- application background to warm paper;
- top bar and workspace header to light surfaces;
- left workspace/sidebar surfaces to translucent fog;
- session rows to light rounded rows with a softer active state;
- buttons, inputs, selects, menus, modals, and management tables to light variants;
- terminal and TUI content switch to white background with dark text.

## Testing

Add Playwright coverage that logs in, switches to Light, verifies the app shell attribute and persisted `localStorage` value, reloads, verifies Light persists, then switches back to Dark and verifies the original style attribute returns.

Add a lightweight source-level regression test that ensures the Light theme CSS selectors and terminal theme colors exist. Full verification still runs `scripts/verify` and `.githooks/pre-commit`.
