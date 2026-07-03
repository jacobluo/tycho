# Custom Project Switcher Design

## Goal

Replace the topbar project browser `<select>` with a custom Vue control that looks native to Tycho's dark and light interface styles while preserving the existing project-switching behavior.

## Requirements

- The topbar must no longer render a browser-native `<select>` for workspace project selection.
- The trigger must expose an accessible combobox-like button labelled `Project`.
- Opening the trigger shows a custom menu of assigned projects.
- Selecting a project updates `selectedProjectId`, persists the project choice, and refreshes project-scoped sessions through the existing App state flow.
- Clicking outside the menu or pressing `Escape` closes it.
- The light theme uses the current milk-gray and orange palette; the dark theme uses existing panel, line, and accent tokens.
- The component must not accept arbitrary paths, commands, or environment values from the browser.

## Design

Add a focused `ProjectSwitcher.vue` component beside `AccountMenu.vue`. It receives `projects`, `selectedProjectId`, and emits `update:selectedProjectId` plus `change`. Internally it renders a labelled button, a popover menu, and menu options; it has no session or routing knowledge.

The App topbar replaces the native select with this component and keeps the existing `persistSelectedProject` handler. E2E helpers switch projects through the new menu so existing project-scoped tests continue to verify real user behavior.

## Testing

- Add an E2E assertion that the workspace topbar has no native project select and can switch via the custom menu.
- Update project-scoped E2E tests to switch projects through the new control.
- Keep existing persistence/session filtering tests passing.
