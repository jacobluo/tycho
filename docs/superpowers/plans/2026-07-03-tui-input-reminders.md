# TUI Input Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually mark TUI sessions whose agent appears to be waiting for user input.

**Architecture:** Add a shared pure helper for best-effort prompt detection. Keep detection frontend-safe by using the existing public pane buffer and running status. Compute waiting pane/window ids in `App.vue`, update pane buffers on live `pane_output`, and render badges/classes in `WorkspaceView.vue`.

**Tech Stack:** Vue 3, TypeScript, CSS, Playwright, Node test runner.

---

### Task 1: Detection Helper With Red Tests

**Files:**
- Create: `src/shared/tui-input-state.ts`
- Create: `src/shared/tui-input-state.test.ts`

- [x] **Step 1: Write failing helper tests**

Create `src/shared/tui-input-state.test.ts` with tests for prompt glyphs, questions, confirmation prompts, stopped panes, and ordinary output.

- [x] **Step 2: Run helper tests and confirm red**

Run:

```bash
node --import tsx --test src/shared/tui-input-state.test.ts
```

Expected: FAIL because `src/shared/tui-input-state.ts` does not exist yet.

- [x] **Step 3: Implement the helper**

Create `src/shared/tui-input-state.ts` exporting:

```ts
export type InputWaitingPane = { status: "running" | "stopped" | "error"; buffer: string };
export function isPaneWaitingForInput(pane: InputWaitingPane): boolean;
```

The function strips ANSI/control sequences, inspects the recent tail, and matches prompt glyphs, question endings, and confirmation prompts.

- [x] **Step 4: Run helper tests and confirm green**

Run:

```bash
node --import tsx --test src/shared/tui-input-state.test.ts
```

Expected: PASS.

### Task 2: Vue State And UI Reminders

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/WorkspaceView.vue`
- Modify: `src/client/src/styles.css`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Write failing E2E coverage**

Add a Playwright test that injects a public tuimux state with one pane whose buffer ends in a prompt/question, then verifies:

- sidebar row shows `Needs input`;
- terminal card titlebar shows `Needs input`;
- card has `input-waiting`;
- active slot remains unchanged.

- [x] **Step 2: Run focused E2E and confirm red**

Run:

```bash
scripts/e2e --grep "input reminder"
```

Expected: FAIL because no reminder UI exists.

- [x] **Step 3: Compute waiting ids in App.vue**

Import `isPaneWaitingForInput`, compute a `Set` of waiting pane ids and a `Set` of waiting window ids, and pass both to `WorkspaceView`.

- [x] **Step 4: Keep pane buffers live on output**

When handling `pane_output`, write the data to xterm and append the same data to the matching `state.panes[].buffer`, capped to `100_000` characters.

- [x] **Step 5: Render reminder badges**

In `WorkspaceView.vue`, add `input-waiting` classes and `Needs input` badges to sidebar rows and terminal titlebars when the matching window or pane is waiting.

- [x] **Step 6: Style dark and light reminders**

Add amber reminder styles for `.session-item.input-waiting`, `.terminal-card.input-waiting`, and `.input-waiting-badge`, including Light mode overrides.

- [x] **Step 7: Run focused tests and confirm green**

Run:

```bash
node --import tsx --test src/shared/tui-input-state.test.ts
scripts/e2e --grep "input reminder"
```

Expected: PASS.

### Task 3: Verification And Commit

**Files:**
- All files above.

- [x] **Step 1: Run broad verification**

Run:

```bash
scripts/typecheck
scripts/e2e --grep "input reminder|workspace interactions|session slot layout"
```

Expected: PASS.

- [x] **Step 2: Run full verification and pre-commit**

Run:

```bash
scripts/verify
.githooks/pre-commit
```

Expected: PASS.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-tui-input-reminders-design.md docs/superpowers/plans/2026-07-03-tui-input-reminders.md src/shared/tui-input-state.ts src/shared/tui-input-state.test.ts e2e/project-management.spec.ts src/client/src/App.vue src/client/src/views/WorkspaceView.vue src/client/src/styles.css
git commit -m "feat: highlight tui sessions waiting for input"
```

Expected: commit succeeds.
