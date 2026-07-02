# Interface Style Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted frontend style switch with the current dark Tycho style and a screenshot-inspired Reader style.

**Architecture:** Keep this frontend-only. Store the selected style in localStorage, expose it as a `data-interface-style` attribute on the authenticated app shell, and layer Reader CSS overrides on top of existing selectors.

**Tech Stack:** Vue 3, TypeScript, CSS, Playwright, Node test runner.

---

### Task 1: Red Tests

**Files:**
- Modify: `e2e/project-management.spec.ts`
- Create: `src/client-interface-style.test.ts`

- [x] **Step 1: Add source-level CSS regression test**

Create `src/client-interface-style.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("client exposes reader interface style hooks", () => {
  const appSource = readFileSync("src/client/src/App.vue", "utf8");
  const cssSource = readFileSync("src/client/src/styles.css", "utf8");

  assert.match(appSource, /data-interface-style/);
  assert.match(appSource, /tycho-interface-style/);
  assert.match(cssSource, /data-interface-style="reader"/);
  assert.match(cssSource, /#f7f5ef/i);
});
```

- [x] **Step 2: Add E2E style switch test**

Add a Playwright test named `interface style switch: toggles reader style and persists across reload` that:

1. logs in as admin;
2. clicks the `Reader` button in the `Interface style` group;
3. expects `.app-shell` to have `data-interface-style="reader"`;
4. checks `localStorage.getItem("tycho-interface-style") === "reader"`;
5. reloads and confirms the attribute is still `reader`;
6. clicks `Dark` and confirms the attribute is `dark`.

- [x] **Step 3: Run focused tests and confirm red**

Run:

```bash
node --import tsx --test src/client-interface-style.test.ts
scripts/e2e --grep "interface style switch"
```

Expected: FAIL because no style switch or Reader CSS exists yet.

### Task 2: Style Switch Implementation

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`

- [x] **Step 1: Add style state in App.vue**

Add:

```ts
type InterfaceStyle = "dark" | "reader";
const interfaceStyle = ref<InterfaceStyle>(readStoredInterfaceStyle());

function isInterfaceStyle(value: string | null): value is InterfaceStyle {
  return value === "dark" || value === "reader";
}

function readStoredInterfaceStyle(): InterfaceStyle {
  const stored = localStorage.getItem("tycho-interface-style");
  return isInterfaceStyle(stored) ? stored : "dark";
}

function setInterfaceStyle(style: InterfaceStyle): void {
  interfaceStyle.value = style;
  localStorage.setItem("tycho-interface-style", style);
}
```

- [x] **Step 2: Add the topbar segmented control**

Set the authenticated shell attribute:

```vue
<main v-else class="app-shell routed-shell" :data-interface-style="interfaceStyle">
```

Add a group inside `.header-actions` before `AccountMenu`:

```vue
<div class="style-switcher" role="group" aria-label="Interface style">
  <button type="button" :class="{ active: interfaceStyle === 'dark' }" :aria-pressed="interfaceStyle === 'dark'" @click="setInterfaceStyle('dark')">Dark</button>
  <button type="button" :class="{ active: interfaceStyle === 'reader' }" :aria-pressed="interfaceStyle === 'reader'" @click="setInterfaceStyle('reader')">Reader</button>
</div>
```

- [x] **Step 3: Add Reader CSS tokens and overrides**

Add CSS under `src/client/src/styles.css` for:

```css
.app-shell[data-interface-style="reader"] {
  color-scheme: light;
  --bg: #f7f5ef;
  --sidebar: rgba(210, 207, 208, 0.82);
  --panel: #fbfaf6;
  --panel-strong: #ece9e2;
  --text: #2d2b27;
  --muted: #77736d;
  --line: #dedbd3;
  --accent: #23c86b;
  --accent-strong: #1f6f49;
  --danger: #b94a48;
}
```

Then add targeted Reader overrides for topbar, sidebars, session rows, buttons, form controls, menus, modals, admin surfaces, and terminal cards while keeping `.terminal-host` dark.

- [x] **Step 4: Run focused tests and confirm green**

Run:

```bash
node --import tsx --test src/client-interface-style.test.ts
scripts/e2e --grep "interface style switch"
```

Expected: PASS.

### Task 3: Visual and Full Verification

**Files:**
- All files above.

- [x] **Step 1: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [x] **Step 2: Run broad E2E around workspace controls**

Run:

```bash
scripts/e2e --grep "interface style switch|workspace interactions|session slot layout"
```

Expected: PASS.

- [x] **Step 3: Capture Reader screenshot for inspection**

Run a local dev server and capture a screenshot of the Reader style workspace with Playwright into `output/interface-style-reader.png`. Inspect it to ensure the sidebar, topbar, session list, and terminal card are visually coherent.

- [x] **Step 4: Run full verification**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 5: Run pre-commit**

Run:

```bash
.githooks/pre-commit
```

Expected: PASS.

- [x] **Step 6: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-interface-style-switch-design.md docs/superpowers/plans/2026-07-03-interface-style-switch.md src/client-interface-style.test.ts e2e/project-management.spec.ts src/client/src/App.vue src/client/src/styles.css
git commit -m "feat: add interface style switch"
```

Expected: commit succeeds.
