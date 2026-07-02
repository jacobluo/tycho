# Session Slot Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add slot-based terminal layouts so users can display one, two, or four running sessions without closing hidden sessions.

**Architecture:** Introduce a shared pure helper module for layout mode resolution and slot assignment rules. Keep `App.vue` as the owner of localStorage-backed layout state and xterm lifecycle. Keep `WorkspaceView.vue` presentational by receiving slot entries and emitting slot/layout events.

**Tech Stack:** Vue 3, TypeScript, Node test runner, Playwright, xterm.

---

### Task 1: Red Tests

**Files:**
- Create: `src/shared/session-slots.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add slot helper unit tests**

Create tests for:

```ts
resolveVisibleSlotIds("single", 1400) -> ["slot-1"]
resolveVisibleSlotIds("two-vertical", 1400) -> ["slot-1", "slot-2"]
resolveVisibleSlotIds("two-horizontal", 1400) -> ["slot-1", "slot-2"]
resolveVisibleSlotIds("quad", 1400) -> ["slot-1", "slot-2", "slot-3", "slot-4"]
resolveVisibleSlotIds("quad", 640) -> ["slot-1"]
assignWindowToSlot({ slot-1: "a", slot-2: "b" }, "slot-2", "a") -> slot-1 cleared, slot-2 assigned "a"
clearWindowFromSlots({ slot-1: "a", slot-2: "b" }, "a") -> slot-1 cleared
```

- [x] **Step 2: Add layout mode E2E**

Add a Playwright test that creates three sessions, switches to `1`, `2 Vertical`, `2 Horizontal`, and `4`, and asserts the visible terminal card count is `1`, `2`, `2`, and `3` respectively.

- [x] **Step 3: Add slot assignment E2E**

Add a Playwright test that selects `2 Vertical`, clicks slot 2, clicks a left Sessions item, and asserts that session appears in slot 2. Then change slot 2 through the slot selector and assert the display changes without closing either session.

- [x] **Step 4: Add hide-vs-close E2E**

Add a Playwright test that hides a slot and asserts the session remains in the left Sessions list. Then close from a slot, confirm the existing `Close Session` dialog, and assert the session is gone.

- [x] **Step 5: Run focused tests and confirm failure**

Run:

```bash
node --import tsx --test src/shared/session-slots.test.ts
scripts/e2e --grep "session slot layout"
```

Expected: FAIL before implementation.

### Task 2: Shared Slot Model

**Files:**
- Create: `src/shared/session-slots.ts`
- Modify: `src/shared/session-slots.test.ts`

- [x] **Step 1: Implement layout and assignment helpers**

Implement:

```ts
export type SessionLayoutMode = "auto" | "single" | "two-vertical" | "two-horizontal" | "quad";
export type SessionSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4";
export type SlotAssignments = Record<SessionSlotId, string | null>;
export const allSessionSlotIds: SessionSlotId[] = ["slot-1", "slot-2", "slot-3", "slot-4"];
export function createEmptySlotAssignments(): SlotAssignments;
export function resolveVisibleSlotIds(mode: SessionLayoutMode, viewportWidth: number): SessionSlotId[];
export function assignWindowToSlot(assignments: SlotAssignments, slotId: SessionSlotId, windowId: string | null): SlotAssignments;
export function clearWindowFromSlots(assignments: SlotAssignments, windowId: string): SlotAssignments;
export function pruneSlotAssignments(assignments: SlotAssignments, liveWindowIds: string[]): SlotAssignments;
```

- [x] **Step 2: Run unit tests and confirm pass**

Run:

```bash
node --import tsx --test src/shared/session-slots.test.ts
```

Expected: PASS.

### Task 3: Vue Slot State

**Files:**
- Modify: `src/client/src/client-types.ts`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/WorkspaceView.vue`

- [x] **Step 1: Add slot entry types**

Add `TerminalSlotEntry` with `slotId`, `label`, optional `windowState`, optional `pane`.

- [x] **Step 2: Add localStorage-backed state**

In `App.vue`, add:

```ts
const layoutMode = ref<SessionLayoutMode>(readStoredLayoutMode());
const activeSlotId = ref<SessionSlotId>(readStoredActiveSlotId());
const viewportWidth = ref(window.innerWidth);
const slotAssignments = reactive<SlotAssignments>(readStoredSlotAssignments());
```

- [x] **Step 3: Derive visible slots**

Add computed `visibleSlotIds` and `slotEntries`. `slotEntries` must include empty slots.

- [x] **Step 4: Sync assignments with live windows**

On state updates and layout changes, prune closed sessions, auto-fill empty visible slots with unassigned sessions, and place newly created sessions into the active slot if visible slots are already full.

- [x] **Step 5: Persist local state**

Persist layout mode, active slot id, and assignments to the `tycho-layout-mode`, `tycho-active-slot-id`, and `tycho-slot-assignments` localStorage keys.

- [x] **Step 6: Wire slot events**

Add handlers:

```ts
setLayoutMode(mode)
setActiveSlot(slotId)
assignSlotWindow(slotId, windowId)
clearSlot(slotId)
focusSlotPane(slotEntry)
```

Left Sessions clicks should assign the clicked session to the active slot and focus it.

### Task 4: Workspace UI

**Files:**
- Modify: `src/client/src/views/WorkspaceView.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Add layout switcher**

Render buttons with accessible names:

- `Auto layout`
- `Single session layout`
- `Two vertical layout`
- `Two horizontal layout`
- `Four session layout`

- [x] **Step 2: Render slots**

Render one card per slot entry. Non-empty slots show selector, status/path, Hide, Close, and terminal host. Empty slots show selector, an empty state, and no Close action.

- [x] **Step 3: Add slot selector**

Each slot gets a select with accessible label `Session for Slot N`. Options are `Empty` plus running sessions.

- [x] **Step 4: Add responsive layout CSS**

Add classes:

- `.terminal-grid.layout-single`
- `.terminal-grid.layout-two-vertical`
- `.terminal-grid.layout-two-horizontal`
- `.terminal-grid.layout-quad`

Narrow screens collapse to one column.

- [x] **Step 5: Preserve xterm mounting**

Continue calling `set-terminal-host` only for non-empty slot entries with a pane.

### Task 5: Verification and Commit

**Files:**
- All files above.

- [x] **Step 1: Run focused tests**

Run:

```bash
node --import tsx --test src/shared/session-slots.test.ts
scripts/e2e --grep "session slot layout"
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `scripts/typecheck`

Expected: PASS.

- [x] **Step 3: Run full verification**

Run: `scripts/verify`

Expected: PASS.

- [x] **Step 4: Run pre-commit**

Run: `.githooks/pre-commit`

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-session-slot-layout.md src/shared/session-slots.ts src/shared/session-slots.test.ts src/client/src/client-types.ts src/client/src/App.vue src/client/src/views/WorkspaceView.vue src/client/src/styles.css e2e/project-management.spec.ts
git commit -m "feat: add session slot layouts"
```

Expected: commit succeeds.
