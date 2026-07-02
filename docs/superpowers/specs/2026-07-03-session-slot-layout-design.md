# Session Slot Layout Design

## Goal

Add flexible session display modes to the Tycho workspace without tying session lifetime to screen placement.

Users should be able to choose how many session windows are visible:

- One session filling the workspace.
- Two sessions split left/right.
- Two sessions split top/bottom.
- Four sessions in a 2x2 grid.
- Auto mode that chooses a sensible layout for the viewport.

The core model is: sessions are running resources; slots are visible placements.

## Concepts

### Session

A tuimux-backed running TUI process. It appears in the left Sessions list and can keep running even when it is not currently displayed in a slot.

### Slot

A visible viewport cell in the workspace. A slot can show one session or be empty. Closing/hiding a slot does not close the session unless the user explicitly chooses `Close Session`.

### Active Slot

The slot that receives the next session chosen from the left Sessions list. Clicking a slot makes it active. Clicking a session in the left Sessions list assigns that session to the active slot.

## Layout Modes

The workspace terminal area gets a compact layout switcher near the terminal header:

- `Auto`
- `1`
- `2 Vertical`
- `2 Horizontal`
- `4`

Mode behavior:

- `1`: one slot fills the terminal workspace.
- `2 Vertical`: two slots side by side.
- `2 Horizontal`: two slots stacked top/bottom.
- `4`: four slots in a 2x2 grid.
- `Auto`: use one slot on narrow screens, two side-by-side on medium screens, and four on wide screens.

Changing layout modes preserves assignments when possible. If the new mode has fewer slots, hidden slots are not closed; their sessions remain running and remain visible in the left Sessions list.

## Slot Assignment

Each slot titlebar includes a session selector:

```text
[ 33333 v ]                      [Hide] [Close Session]
```

Selector behavior:

- Shows all running sessions plus `Empty`.
- Selecting a session assigns it to that slot.
- Selecting `Empty` clears the slot without closing the session.
- The selected session remains running even if removed from the slot.

Left Sessions list behavior:

- Clicking a session assigns it to the active slot.
- If no active slot exists, Tycho uses the first visible slot.
- The clicked session becomes the selected session for that slot and receives terminal focus.

Slot action behavior:

- `Hide` clears the slot assignment only.
- `Close Session` opens the existing session close confirmation and closes the underlying tuimux session only after confirmation.
- If a closed session was assigned to one or more slots, those slots become empty.

## State

First implementation stores layout preferences in browser `localStorage`:

- `tycho-layout-mode`
- `tycho-slot-assignments`
- `tycho-active-slot-id`

This keeps the feature browser-local and avoids database changes. A future sync feature can move layout preferences into user settings if needed.

The slot state should be derived against live sessions on each render:

- Assignments to missing/closed windows are ignored.
- Empty slots render an empty state with a clear prompt to choose a session.
- A running session may appear in more than one slot only if the user explicitly assigns it twice. The first implementation should prevent accidental duplicates by moving an already-visible session to the newly selected slot and clearing the previous slot.

## UX Details

- Use icon-style segmented controls for layout modes where possible.
- Keep controls compact; this is an operations workspace, not a landing page.
- Active slot uses the same accent border language as the current active terminal card.
- Empty slots should not look like errors. They should be quiet, with a single action to choose a session.
- Mobile and narrow screens force one visible slot even when `2` or `4` is selected; the selected mode remains saved for wider screens.

## Testing

Unit tests:

- Layout mode resolves the correct visible slot count for desktop and narrow widths.
- Assigning a session to a slot prevents accidental duplicate display.
- Closing a session clears assignments for that session.

E2E tests:

- User can switch between `1`, `2 Vertical`, `2 Horizontal`, and `4`.
- User can assign sessions by clicking the left Sessions list into the active slot.
- User can change a slot session through the slot selector.
- `Hide` clears display but leaves the session in the left Sessions list.
- `Close Session` still uses the existing confirmation and removes the running session.
- Terminal card order and active selection remain stable across layout changes.

## Out of Scope

- Drag and drop session assignment.
- Persisting layout preferences in the database.
- Multiple browser/device layout sync.
- Changing tuimux process/session management.
