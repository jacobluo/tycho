# Project-Scoped Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the workspace session list and terminal slots to the currently selected project while keeping other project sessions alive.

**Architecture:** Add safe project metadata to public session entries, then make the Vue workspace derive current-project windows, panes, slot entries, and selected state from the full server state. Slot assignment sync operates on the current project view so switching projects hides unrelated sessions without closing them.

**Tech Stack:** TypeScript, Vue 3, Express/WebSocket, tuimux, Node test runner, Playwright.

---

### Task 1: Public Session Project Metadata

**Files:**
- Modify: `src/runtime/config.ts`
- Modify: `src/runtime/config.test.ts`
- Modify: `src/client/src/client-types.ts`

- [x] **Step 1: Write failing unit test**

Update `src/runtime/config.test.ts` in `browser-safe session entries omit env while internal entries keep it` to assert:

```ts
assert.equal(publicEntry.projectId, "safe-entry");
assert.equal(publicEntry.projectName, "Safe Entry");
assert.equal(publicEntry.projectPath, projectPath);
```

Also update `browser-safe tuimux state omits nested pane env` to assert:

```ts
assert.equal(publicState.panes[0].entry.projectId, "safe-state");
assert.equal(publicState.panes[0].entry.projectName, "Safe State");
assert.equal(publicState.panes[0].entry.projectPath, projectPath);
```

- [x] **Step 2: Run focused unit test and confirm red**

Run:

```bash
node --import tsx --test src/runtime/config.test.ts
```

Expected: FAIL because `projectId`, `projectName`, and `projectPath` are missing from public entries.

- [x] **Step 3: Implement safe public metadata**

Change `PublicAgentEntry` in `src/runtime/config.ts` to include:

```ts
export type PublicAgentEntry = Omit<AgentEntry, "env"> & {
  projectId?: string;
  projectName?: string;
  projectPath?: string;
};
```

Change `toPublicAgentEntry` to derive values from internal env:

```ts
export function toPublicAgentEntry(entry: AgentEntry): PublicAgentEntry {
  const { env, ...publicEntry } = entry;
  return {
    ...publicEntry,
    ...(env?.REMOTE_TUI_PROJECT_ID ? { projectId: env.REMOTE_TUI_PROJECT_ID } : {}),
    ...(env?.REMOTE_TUI_PROJECT_NAME ? { projectName: env.REMOTE_TUI_PROJECT_NAME } : {}),
    ...(env?.REMOTE_TUI_PROJECT_PATH ? { projectPath: env.REMOTE_TUI_PROJECT_PATH } : {})
  };
}
```

Update `src/client/src/client-types.ts` `AgentEntry` to include:

```ts
projectId?: string;
projectName?: string;
projectPath?: string;
```

- [x] **Step 4: Run focused unit test and confirm green**

Run:

```bash
node --import tsx --test src/runtime/config.test.ts
```

Expected: PASS.

### Task 2: Current-Project Workspace Filtering

**Files:**
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/views/WorkspaceView.vue`

- [x] **Step 1: Add failing E2E project filter test**

Add a Playwright test to `e2e/project-management.spec.ts` that:

1. Logs in as admin.
2. Adds two managed projects.
3. Selects project A and creates `Alpha Session`.
4. Selects project B and creates `Beta Session`.
5. Asserts project B shows `Beta Session` and hides `Alpha Session`.
6. Selects project A and asserts `Alpha Session` reappears and `Beta Session` hides.
7. Selects project B and asserts `Beta Session` reappears.

- [x] **Step 2: Run focused E2E and confirm red**

Run:

```bash
scripts/e2e --grep "project scoped sessions"
```

Expected: FAIL because the workspace still shows sessions from all projects.

- [x] **Step 3: Derive current-project state in App**

Add computed values in `src/client/src/App.vue`:

```ts
const projectPanes = computed(() => state.panes.filter((pane) => paneProjectId(pane) === selectedProjectId.value));
const projectPaneIds = computed(() => new Set(projectPanes.value.map((pane) => pane.paneId)));
const projectWindows = computed(() => state.windows.filter((windowState) => projectPaneIds.value.has(windowState.activePaneId)));
const projectState = computed<TuimuxState>(() => ({
  ...state,
  windows: projectWindows.value,
  panes: projectPanes.value,
  activeWindowId: projectWindows.value.some((windowState) => windowState.id === state.activeWindowId) ? state.activeWindowId : null,
  activePaneId: projectPaneIds.value.has(state.activePaneId || "") ? state.activePaneId : null
}));
```

Pass `projectState` to `WorkspaceView` instead of `state`.

- [x] **Step 4: Filter computed entries and selected window**

Change `selectedWindowId`, `terminalEntries`, and `slotEntries` to use `projectWindows.value`/`projectPanes.value` through helpers:

```ts
function paneForWindowInProject(windowState: TuimuxWindow): TuimuxPane | undefined {
  return projectPanes.value.find((pane) => pane.paneId === windowState.activePaneId);
}
```

Keep the existing `paneForWindow` for global operations that need full state.

- [x] **Step 5: Make slot sync project-aware**

Change `syncSlotAssignments` to build `liveWindowIds` from `projectWindows.value`. When resolving preferred windows, use `projectWindows.value` and `projectState.value.activePaneId`/`projectState.value.activeWindowId`. Fill slots only from `projectWindows.value`.

- [x] **Step 6: Keep workspace empty state project-aware**

Because `WorkspaceView` receives `projectState`, no extra template condition is needed beyond using `state.windows.length`. Confirm slot dropdown options use the filtered `state.windows` prop.

- [x] **Step 7: Run focused E2E and confirm green**

Run:

```bash
scripts/e2e --grep "project scoped sessions"
```

Expected: PASS.

### Task 3: Verification and Commit

**Files:**
- All files above.

- [x] **Step 1: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [x] **Step 2: Run focused and broad tests**

Run:

```bash
node --import tsx --test src/runtime/config.test.ts
scripts/e2e --grep "project scoped sessions|session slot layout|single active session selection"
```

Expected: PASS.

- [x] **Step 3: Run full verification**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 4: Run pre-commit**

Run:

```bash
.githooks/pre-commit
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-03-project-scoped-sessions-design.md docs/superpowers/plans/2026-07-03-project-scoped-sessions.md src/runtime/config.ts src/runtime/config.test.ts src/client/src/client-types.ts src/client/src/App.vue src/client/src/views/WorkspaceView.vue e2e/project-management.spec.ts
git commit -m "feat: filter sessions by selected project"
```

Expected: commit succeeds.

### Task 4: Restored Session Project Fallback

**Files:**
- Modify: `e2e/project-management.spec.ts`
- Modify: `src/client/src/App.vue`
- Modify: `docs/superpowers/specs/2026-07-03-project-scoped-sessions-design.md`
- Modify: `docs/superpowers/plans/2026-07-03-project-scoped-sessions.md`

- [x] **Step 1: Add regression test for restored sessions without metadata**

Add an E2E test named `project scoped sessions: restored sessions without project metadata use cwd for filtering`. The test injects two browser-visible panes with no `entry.projectId`, only `entry.cwd` values matching two managed project paths, then switches the project selector and verifies only the matching session appears.

- [x] **Step 2: Run regression test and confirm red**

Run:

```bash
scripts/e2e --grep "restored sessions without project metadata"
```

Expected: FAIL because `paneProjectId` only reads `entry.projectId`.

- [x] **Step 3: Implement cwd fallback**

Update `paneProjectId` so it:

1. returns `pane.entry.projectId` when present;
2. otherwise uses `pane.entry.projectPath || pane.entry.cwd`;
3. returns the id of the configured project whose path matches that value.

- [x] **Step 4: Run regression test and confirm green**

Run:

```bash
scripts/e2e --grep "restored sessions without project metadata"
```

Expected: PASS.

- [x] **Step 5: Run broad verification**

Run:

```bash
scripts/typecheck
scripts/e2e --grep "project scoped sessions|restored sessions without project metadata|session slot layout"
```

Expected: PASS.
