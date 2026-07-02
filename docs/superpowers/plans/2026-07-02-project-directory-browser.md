# Project Directory Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe server-side directory picker for Project Management path selection.

**Architecture:** Implement a focused runtime directory browser module that parses allowed roots, uses real paths for containment, and returns one directory level at a time. Expose it through an admin-only Express route, then add a Vue dialog component that writes the selected server path into the existing project form without changing the save API.

**Tech Stack:** TypeScript, Node filesystem APIs, Express, Vue 3, Playwright E2E, Node test runner.

---

## File Structure

- Create `src/runtime/directory-browser.ts`: server-side root parsing, containment, directory listing, and response shaping.
- Create `src/runtime/directory-browser.test.ts`: unit coverage for disabled config, development defaults, root listing, child listing, out-of-root rejection, file rejection, and symlink escape protection.
- Modify `src/server/index.ts`: add admin-only `GET /api/directories`.
- Modify `src/client/src/client-types.ts`: add `DirectoryBrowserEntry` and `DirectoryBrowserResponse`.
- Create `src/client/src/components/DirectoryPickerDialog.vue`: reusable server directory picker dialog.
- Modify `src/client/src/views/ProjectManagementView.vue`: add Browse button beside Local Path and wire picker selection into `projectForm.path`.
- Modify `src/client/src/styles.css`: style path input group, directory picker rows, path bar, states, and footer.
- Modify `e2e/project-management.spec.ts`: cover Browse add/edit workflows and directory API authorization.

## Task 1: Runtime Directory Browser

**Files:**
- Create: `src/runtime/directory-browser.ts`
- Create: `src/runtime/directory-browser.test.ts`

- [x] **Step 1: Write failing runtime tests**

Create `src/runtime/directory-browser.test.ts` with tests shaped around this API:

```ts
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDirectories, resolveDirectoryBrowserRoots } from "./directory-browser.js";

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

function makeDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `tycho-${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.env = { ...originalEnv };
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("directory browser", () => {
  test("is disabled in production without configured roots", async () => {
    delete process.env.PROJECT_BROWSER_ROOTS;
    process.env.NODE_ENV = "production";
    assert.deepEqual(await resolveDirectoryBrowserRoots(), []);
  });

  test("uses the development home directory fallback", async () => {
    delete process.env.PROJECT_BROWSER_ROOTS;
    process.env.NODE_ENV = "development";
    process.env.HOME = makeDir("home");
    assert.deepEqual(await resolveDirectoryBrowserRoots(), [
      { name: process.env.HOME.split("/").at(-1), path: process.env.HOME }
    ]);
  });

  test("lists roots without enumerating slash", async () => {
    const root = makeDir("root");
    process.env.PROJECT_BROWSER_ROOTS = root;
    assert.deepEqual(await listDirectories(), {
      roots: [{ name: root.split("/").at(-1), path: root }],
      currentPath: null,
      parentPath: null,
      entries: [{ name: root.split("/").at(-1), path: root }]
    });
  });

  test("lists child directories only and sorts by name", async () => {
    const root = makeDir("root");
    mkdirSync(join(root, "zeta"));
    mkdirSync(join(root, "alpha"));
    writeFileSync(join(root, "file.txt"), "not shown");
    process.env.PROJECT_BROWSER_ROOTS = root;
    const result = await listDirectories(root);
    assert.deepEqual(result.entries.map((entry) => entry.name), ["alpha", "zeta"]);
  });

  test("rejects paths outside configured roots", async () => {
    const root = makeDir("root");
    const outside = makeDir("outside");
    process.env.PROJECT_BROWSER_ROOTS = root;
    await assert.rejects(() => listDirectories(outside), /Directory path is outside configured roots/);
  });

  test("rejects non-directory paths", async () => {
    const root = makeDir("root");
    const filePath = join(root, "file.txt");
    writeFileSync(filePath, "not a directory");
    process.env.PROJECT_BROWSER_ROOTS = root;
    await assert.rejects(() => listDirectories(filePath), /Directory path is not a directory/);
  });

  test("omits symlinks that escape configured roots", async () => {
    const root = makeDir("root");
    const outside = makeDir("outside");
    symlinkSync(outside, join(root, "escape"));
    process.env.PROJECT_BROWSER_ROOTS = root;
    const result = await listDirectories(root);
    assert.equal(result.entries.some((entry) => entry.name === "escape"), false);
  });
});
```

- [x] **Step 2: Run runtime tests to verify RED**

Run:

```bash
scripts/test
```

Expected: FAIL because `src/runtime/directory-browser.ts` does not exist.

- [x] **Step 3: Implement runtime browser**

Create `src/runtime/directory-browser.ts` exporting:

```ts
export type DirectoryBrowserEntry = { name: string; path: string };
export type DirectoryBrowserResponse = {
  roots: DirectoryBrowserEntry[];
  currentPath: string | null;
  parentPath: string | null;
  entries: DirectoryBrowserEntry[];
};
export const DIRECTORY_BROWSER_ENTRY_LIMIT = 500;
export async function resolveDirectoryBrowserRoots(): Promise<DirectoryBrowserEntry[]>;
export async function listDirectories(requestedPath?: string): Promise<DirectoryBrowserResponse>;
```

Implementation requirements:

- Split `PROJECT_BROWSER_ROOTS` by `delimiter`.
- Use `realpath` for roots and requested paths.
- In production with no roots, return no roots.
- In development with no roots, default to `process.env.HOME || projectRoot`.
- Return root entries when `requestedPath` is omitted.
- Reject outside paths with `Directory path is outside configured roots`.
- Reject files with `Directory path is not a directory`.
- Use `readdir(currentPath, { withFileTypes: true })`, include directories only, sort by `name.localeCompare`, omit entries that cannot be `realpath`/`stat`, and omit entries outside roots.
- Return `parentPath` only when the parent is still inside an allowed root.

- [x] **Step 4: Run runtime tests to verify GREEN**

Run:

```bash
scripts/test
```

Expected: PASS, including the new directory browser tests.

- [x] **Step 5: Commit runtime slice**

Run:

```bash
git add src/runtime/directory-browser.ts src/runtime/directory-browser.test.ts docs/superpowers/plans/2026-07-02-project-directory-browser.md
git commit -m "feat: add safe directory browser runtime"
```

## Task 2: Admin Directory API

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/runtime/directory-browser.test.ts`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add failing E2E API assertions**

In `e2e/project-management.spec.ts`, add a test that:

```ts
test("directory browser API is admin-only and root constrained", async ({ page }) => {
  await login(page, "admin", "admin");
  const adminStatus = await page.evaluate(async () => {
    const response = await fetch("/api/directories");
    return response.status;
  });
  expect(adminStatus).toBe(200);

  const outsideStatus = await page.evaluate(async () => {
    const response = await fetch(`/api/directories?path=${encodeURIComponent("/")}`);
    return response.status;
  });
  expect(outsideStatus).toBe(403);

  await logout(page);
  await login(page, "admin", "admin");
  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill("directory-user");
  await page.getByLabel("New Password").fill("directory-password");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");

  await logout(page);
  await login(page, "directory-user", "directory-password");
  const userStatus = await page.evaluate(async () => {
    const response = await fetch("/api/directories");
    return response.status;
  });
  expect(userStatus).toBe(403);
});
```

- [x] **Step 2: Run focused E2E to verify RED**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "directory browser API"
```

Expected: FAIL because `/api/directories` does not exist.

- [x] **Step 3: Implement `GET /api/directories`**

Modify `src/server/index.ts`:

```ts
import { listDirectories } from "../runtime/directory-browser.js";
```

Add before project mutation routes:

```ts
app.get("/api/directories", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  try {
    const path = typeof request.query.path === "string" ? request.query.path : undefined;
    response.json(await listDirectories(path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Directory is not available";
    if (message.includes("outside configured roots")) {
      response.status(403).json({ error: "Directory is not available" });
      return;
    }
    if (message.includes("not found")) {
      response.status(404).json({ error: "Directory is not available" });
      return;
    }
    if (message.includes("not a directory")) {
      response.status(400).json({ error: "Directory is not available" });
      return;
    }
    response.status(400).json({ error: "Directory is not available" });
  }
});
```

- [x] **Step 4: Run focused E2E to verify GREEN**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "directory browser API"
```

Expected: PASS.

- [x] **Step 5: Commit API slice**

Run:

```bash
git add src/server/index.ts e2e/project-management.spec.ts docs/superpowers/plans/2026-07-02-project-directory-browser.md
git commit -m "feat: expose admin directory browser API"
```

## Task 3: Directory Picker UI

**Files:**
- Modify: `src/client/src/client-types.ts`
- Create: `src/client/src/components/DirectoryPickerDialog.vue`
- Modify: `src/client/src/views/ProjectManagementView.vue`
- Modify: `src/client/src/styles.css`
- Modify: `e2e/project-management.spec.ts`

- [x] **Step 1: Add failing E2E Browse workflow**

Update the project add/edit E2E flow so it:

```ts
await page.getByRole("button", { name: "Browse" }).click();
await expect(page.getByRole("heading", { name: "Choose Project Folder" })).toBeVisible();
await page.getByRole("button", { name: "Use This Folder" }).click();
await expect(page.getByLabel("Local Path")).toHaveValue(projectPath);
```

Use Playwright webServer env roots by changing `playwright.config.ts` command to include:

```ts
PROJECT_BROWSER_ROOTS=${tmpdir()}
```

Then create E2E project directories under `tmpdir()` as the existing tests already do.

- [x] **Step 2: Run focused E2E to verify RED**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
```

Expected: FAIL because the Browse button and dialog do not exist.

- [x] **Step 3: Add client types**

Modify `src/client/src/client-types.ts`:

```ts
export type DirectoryBrowserEntry = { name: string; path: string };
export type DirectoryBrowserResponse = {
  roots: DirectoryBrowserEntry[];
  currentPath: string | null;
  parentPath: string | null;
  entries: DirectoryBrowserEntry[];
};
```

- [x] **Step 4: Create directory picker component**

Create `src/client/src/components/DirectoryPickerDialog.vue` with props:

```ts
defineProps<{ open: boolean; initialPath: string }>();
```

and emits:

```ts
const emit = defineEmits<{ close: []; select: [path: string] }>();
```

Component behavior:

- Fetch `/api/directories` on open.
- If `initialPath` is non-empty, fetch `/api/directories?path=<initialPath>` and fall back to roots on failure.
- Show `Choose Project Folder`.
- Render current path, root/current entries, `Up`, `Cancel`, `Use This Folder`.
- Disable `Use This Folder` until a selected path exists.
- On `select`, emit the selected path and close in the parent.

- [x] **Step 5: Wire Project Management**

Modify `ProjectManagementView.vue`:

- Import `DirectoryPickerDialog`.
- Add `const directoryPickerOpen = ref(false);`.
- Wrap Local Path input and Browse button in `.path-input-row`.
- Add:

```html
<button type="button" @click="directoryPickerOpen = true">Browse</button>
<DirectoryPickerDialog
  :open="directoryPickerOpen"
  :initial-path="projectForm.path"
  @close="directoryPickerOpen = false"
  @select="selectProjectDirectory"
/>
```

- Add:

```ts
function selectProjectDirectory(path: string): void {
  props.projectForm.path = path;
  directoryPickerOpen.value = false;
}
```

- [x] **Step 6: Add styles**

Modify `src/client/src/styles.css` with classes:

- `.path-input-row`
- `.directory-picker`
- `.directory-path-bar`
- `.directory-list`
- `.directory-row`
- `.directory-row.selected`
- `.directory-dialog-footer`

Keep the existing dark admin palette and do not introduce a new visual system.

- [x] **Step 7: Run focused E2E to verify GREEN**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts --grep "adds and deletes"
```

Expected: PASS.

- [x] **Step 8: Commit UI slice**

Run:

```bash
git add src/client/src/client-types.ts src/client/src/components/DirectoryPickerDialog.vue src/client/src/views/ProjectManagementView.vue src/client/src/styles.css e2e/project-management.spec.ts playwright.config.ts docs/superpowers/plans/2026-07-02-project-directory-browser.md
git commit -m "feat: add project directory picker UI"
```

## Task 4: Full Verification and PR

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-project-directory-browser.md`

- [x] **Step 1: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [x] **Step 2: Run tests**

Run:

```bash
scripts/test
```

Expected: PASS.

- [x] **Step 3: Run E2E**

Run:

```bash
scripts/e2e
```

Expected: PASS.

- [x] **Step 4: Run full verify**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [ ] **Step 5: Push and create PR**

Run:

```bash
git push -u origin codex/project-directory-browser
gh pr create --title "Add project directory browser" --body "$(cat <<'EOF'
## Summary
- add a safe admin-only server directory browser constrained by configured roots
- add a Project Management Browse dialog that fills the existing Local Path field
- cover root containment, symlink escape, authorization, and add/edit browse workflows

## Test Plan
- [ ] scripts/verify
EOF
)"
```
