# Terminal Fit Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use xterm FitAddon for accurate terminal dimensions and prevent resize-driven TUI reflow.

**Architecture:** Keep terminal mounting in `App.vue`, but store a FitAddon in each `TerminalRecord`. Replace manual width/height math with `fitAddon.fit()` and send resize only when term cols/rows change.

**Tech Stack:** Vue 3, TypeScript, xterm, `@xterm/addon-fit`, Playwright, Node test runner.

---

### Task 1: Red Tests

**Files:**
- Modify: `e2e/project-management.spec.ts`
- Create: `src/client-terminal-resize.test.ts`

- [x] **Step 1: Add source-level resize regression test**

Add a Node test that reads `src/client/src/App.vue` and asserts:

- it imports `@xterm/addon-fit`
- it does not contain the old hard-coded `/ 7.8` or `/ 15.4` resize estimates

- [x] **Step 2: Add focused E2E resize test**

Intercept websocket resize messages, create a session, switch between `Single session layout` and `Four session layout`, and assert resize messages contain valid positive `cols` and `rows`.

- [x] **Step 3: Run focused tests and confirm failure**

Run:

```bash
node --import tsx --test src/client-terminal-resize.test.ts
scripts/e2e --grep "terminal resize fit"
```

Expected: FAIL before implementation.

### Task 2: Implementation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/client/src/client-types.ts`
- Modify: `src/client/src/App.vue`

- [x] **Step 1: Add FitAddon dependency**

Run:

```bash
pnpm add @xterm/addon-fit
```

- [x] **Step 2: Store FitAddon per terminal**

Add `fitAddon` and optional `lastResize` to `TerminalRecord`.

- [x] **Step 3: Load and use FitAddon**

Import `FitAddon`, load it in `mountTerminal`, store it, and call `resizeTerminal`.

- [x] **Step 4: Replace manual resize math**

Change `resizeTerminal` to:

```ts
record.fitAddon.fit();
const cols = record.term.cols;
const rows = record.term.rows;
if (cols <= 0 || rows <= 0) return;
if (record.lastResize?.cols === cols && record.lastResize?.rows === rows) return;
record.lastResize = { cols, rows };
send({ type: "resize", paneId, cols, rows });
```

- [x] **Step 5: Run focused tests and confirm pass**

Run:

```bash
node --import tsx --test src/client-terminal-resize.test.ts
scripts/e2e --grep "terminal resize fit"
```

Expected: PASS.

### Task 3: Verification and Commit

**Files:**
- All files above.

- [x] **Step 1: Run typecheck**

Run: `scripts/typecheck`

Expected: PASS.

- [x] **Step 2: Run full verification**

Run: `scripts/verify`

Expected: PASS.

- [x] **Step 3: Run pre-commit**

Run: `.githooks/pre-commit`

Expected: PASS.

- [x] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-terminal-fit-resize-design.md docs/superpowers/plans/2026-07-03-terminal-fit-resize.md package.json pnpm-lock.yaml src/client-terminal-resize.test.ts src/client/src/client-types.ts src/client/src/App.vue e2e/project-management.spec.ts
git commit -m "fix: fit terminal resize to xterm cells"
```

Expected: commit succeeds.
