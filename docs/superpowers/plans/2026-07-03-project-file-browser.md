# Project File Browser Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, current-project right-side file browser drawer with text preview.

**Architecture:** Add a dedicated runtime project file module that accepts a configured project and relative paths only, performs realpath containment checks, and returns listings/previews. Expose project-scoped authenticated APIs, then wire a Vue drawer beside the topbar project switcher with draggable width, current-directory search, and copy actions.

**Tech Stack:** TypeScript, Node filesystem APIs, Express, Vue 3, Playwright, Node test runner.

---

## File Structure

- Create `src/runtime/project-files.ts`: project-scoped path resolution, listing, sensitivity detection, text/binary preview logic.
- Create `src/runtime/project-files.test.ts`: unit tests for listing, sorting, containment, symlink escape, sensitive preview blocking, truncation, and binary detection.
- Modify `src/server/index.ts`: add authenticated project file listing and preview endpoints guarded by `userCanAccessProject`.
- Modify `src/client/src/client-types.ts`: add project file listing and preview response types.
- Create `src/client/src/components/ProjectFilesDrawer.vue`: right-side project file browser drawer UI.
- Modify `src/client/src/App.vue`: manage drawer open state, selected project reset behavior, and topbar Files button.
- Modify `src/client/src/views/WorkspaceView.vue`: no direct file logic; remains focused on workspace sessions.
- Modify `src/client/src/styles.css`: drawer, resize handle, file rows, search, preview, and light/dark theme styles.
- Modify `e2e/project-management.spec.ts`: add file browser workspace tests and API access tests.

## Task 1: Runtime Project File Browser

**Files:**
- Create: `src/runtime/project-files.ts`
- Create: `src/runtime/project-files.test.ts`
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Write failing runtime tests**

Create `src/runtime/project-files.test.ts`:

```ts
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectFiles, previewProjectFile, PROJECT_FILE_PREVIEW_LIMIT } from "./project-files.js";
import type { ProjectConfig } from "./config.js";

const tempDirs: string[] = [];

function makeProject(): ProjectConfig {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tycho-project-files-")));
  tempDirs.push(dir);
  return { id: "alpha", name: "Alpha", path: dir };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("project file browser", () => {
  test("lists root entries with directories before files sorted by name", async () => {
    const project = makeProject();
    mkdirSync(join(project.path, "zeta"));
    mkdirSync(join(project.path, "alpha"));
    writeFileSync(join(project.path, "readme.md"), "# Readme");
    writeFileSync(join(project.path, "app.ts"), "console.log('ok');");

    const listing = await listProjectFiles(project, "");

    assert.equal(listing.projectId, "alpha");
    assert.equal(listing.projectName, "Alpha");
    assert.equal(listing.currentPath, "");
    assert.equal(listing.parentPath, null);
    assert.deepEqual(listing.entries.map((entry) => `${entry.type}:${entry.name}`), [
      "directory:alpha",
      "directory:zeta",
      "file:app.ts",
      "file:readme.md"
    ]);
  });

  test("lists nested directories and exposes parent path", async () => {
    const project = makeProject();
    mkdirSync(join(project.path, "src"));
    mkdirSync(join(project.path, "src", "components"));
    writeFileSync(join(project.path, "src", "main.ts"), "export {};");

    const listing = await listProjectFiles(project, "src");

    assert.equal(listing.currentPath, "src");
    assert.equal(listing.parentPath, "");
    assert.deepEqual(listing.entries.map((entry) => entry.relativePath), ["src/components", "src/main.ts"]);
  });

  test("rejects traversal outside the project root", async () => {
    const project = makeProject();

    await assert.rejects(() => listProjectFiles(project, "../outside"), /File path is outside project/);
    await assert.rejects(() => previewProjectFile(project, "../outside.txt"), /File path is outside project/);
  });

  test("rejects symlinks that escape the project root", async () => {
    const project = makeProject();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "tycho-project-files-outside-")));
    tempDirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "hidden");
    symlinkSync(outside, join(project.path, "escape"));

    const listing = await listProjectFiles(project, "");

    assert.equal(listing.entries.some((entry) => entry.name === "escape"), false);
    await assert.rejects(() => listProjectFiles(project, "escape"), /File path is outside project/);
  });

  test("shows sensitive files in listings but blocks preview content", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, ".env.local"), "TOKEN=abc");
    writeFileSync(join(project.path, "api-secret.txt"), "secret");

    const listing = await listProjectFiles(project, "");
    const envEntry = listing.entries.find((entry) => entry.name === ".env.local");
    const secretEntry = listing.entries.find((entry) => entry.name === "api-secret.txt");
    assert.equal(envEntry?.sensitive, true);
    assert.equal(secretEntry?.sensitive, true);

    const preview = await previewProjectFile(project, ".env.local");
    assert.equal(preview.previewable, false);
    assert.equal(preview.sensitive, true);
    assert.equal(preview.reason, "sensitive");
    assert.equal(preview.content, "");
  });

  test("previews text files and caps content at 256 KB", async () => {
    const project = makeProject();
    const content = "a".repeat(PROJECT_FILE_PREVIEW_LIMIT + 100);
    writeFileSync(join(project.path, "large.txt"), content);

    const preview = await previewProjectFile(project, "large.txt");

    assert.equal(preview.previewable, true);
    assert.equal(preview.truncated, true);
    assert.equal(preview.content.length, PROJECT_FILE_PREVIEW_LIMIT);
  });

  test("blocks binary preview", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, "image.bin"), Buffer.from([0, 1, 2, 0, 3]));

    const preview = await previewProjectFile(project, "image.bin");

    assert.equal(preview.previewable, false);
    assert.equal(preview.reason, "binary");
    assert.equal(preview.content, "");
  });
});
```

- [x] **Step 2: Run focused tests to verify RED**

Run:

```bash
pnpm exec tsx --test src/runtime/project-files.test.ts
```

Expected: FAIL because `src/runtime/project-files.ts` does not exist.

- [x] **Step 3: Implement runtime module**

Create `src/runtime/project-files.ts` with:

```ts
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { ProjectConfig } from "./config.js";

export const PROJECT_FILE_PREVIEW_LIMIT = 256 * 1024;
export const PROJECT_FILE_ENTRY_LIMIT = 1000;

export type ProjectFileEntry = {
  name: string;
  relativePath: string;
  type: "directory" | "file";
  size: number | null;
  modifiedAt: string | null;
  sensitive: boolean;
};

export type ProjectDirectoryListing = {
  projectId: string;
  projectName: string;
  currentPath: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};

export type ProjectFilePreview = {
  projectId: string;
  relativePath: string;
  name: string;
  size: number;
  modifiedAt: string | null;
  sensitive: boolean;
  previewable: boolean;
  truncated: boolean;
  content: string;
  reason?: "sensitive" | "directory" | "binary" | "too-large" | "not-found";
};
```

Implementation requirements:

- Treat empty relative path as project root.
- Reject absolute client paths.
- Normalize relative paths with `resolve(projectRoot, relativePath)` and `realpath`.
- Use `relative(rootRealPath, candidateRealPath)` containment; reject `..` or absolute relative output.
- Convert all returned paths to slash-separated project-relative paths.
- Omit listing entries that cannot be read, statted, or resolve outside the project root.
- Sort directories before files, then by `name.localeCompare`.
- Mark sensitive files/directories by basename using `.env`, `.env.*`, and names containing `secret`, `token`, `credential`, `private`, or `key`.
- Detect binary preview by checking for NUL bytes in the read buffer.
- Return UTF-8 text from the first `PROJECT_FILE_PREVIEW_LIMIT` bytes.

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm exec tsx --test src/runtime/project-files.test.ts
```

Expected: PASS.

- [x] **Step 5: Update this plan checklist**

Mark Task 1 steps complete in `docs/superpowers/plans/2026-07-03-project-file-browser.md`.

- [x] **Step 6: Include runtime slice in the final feature commit**

Run:

```bash
git add src/runtime/project-files.ts src/runtime/project-files.test.ts docs/superpowers/plans/2026-07-03-project-file-browser.md
git commit -m "feat: add project file browser runtime"
```

## Task 2: Project File API

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/client/src/client-types.ts`
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Write failing server/API tests through E2E**

Append focused API checks to `e2e/project-management.spec.ts`:

```ts
test("project file API is scoped to assigned projects", async ({ page }) => {
  const allowedPath = makeProjectDir();
  const blockedPath = makeProjectDir();

  await login(page, "admin", "admin");
  await addManagedProject(page, "E2E Files Allowed", allowedPath);
  await addManagedProject(page, "E2E Files Blocked", blockedPath);
  const projectIds = await page.evaluate(async () => {
    const response = await fetch("/api/config");
    const config = (await response.json()) as { projects: Array<{ id: string; name: string }> };
    return {
      allowed: config.projects.find((project) => project.name === "E2E Files Allowed")?.id || "",
      blocked: config.projects.find((project) => project.name === "E2E Files Blocked")?.id || ""
    };
  });
  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill("file-user");
  await page.getByLabel("New Password").fill("file-password");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");
  await page.getByRole("row", { name: /file-user/ }).getByRole("checkbox", { name: "Select file-user" }).check();
  await page.getByRole("button", { name: "Edit User" }).click();
  await page.getByLabel("Project E2E Files Allowed").check();
  await page.getByRole("button", { name: "Save Projects" }).click();

  await logout(page);
  await login(page, "file-user", "file-password");
  const statuses = await page.evaluate(async ({ allowed, blocked }) => {
    const allowedResponse = await fetch(`/api/projects/${encodeURIComponent(allowed)}/files`);
    const blockedResponse = await fetch(`/api/projects/${encodeURIComponent(blocked)}/files`);
    const traversalResponse = await fetch(`/api/projects/${encodeURIComponent(allowed)}/files?path=${encodeURIComponent("../")}`);
    return {
      allowed: allowedResponse.status,
      blocked: blockedResponse.status,
      traversal: traversalResponse.status
    };
  }, projectIds);

  expect(statuses).toEqual({ allowed: 200, blocked: 403, traversal: 400 });

  await logout(page);
  await login(page, "admin", "admin");
  await deleteManagedProjectsByName(page, ["E2E Files Allowed", "E2E Files Blocked"]);
});
```

- [ ] **Step 2: Run focused E2E to verify RED**

This RED command was not run before production implementation because test and implementation subagents worked in parallel after the runtime and client source RED checks. The API behavior was still covered by the focused E2E green run and the full `scripts/verify` run.

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts -g "project file API is scoped"
```

Expected: FAIL because `/api/projects/:projectId/files` does not exist.

- [x] **Step 3: Add shared client types**

In `src/client/src/client-types.ts`, add the same `ProjectFileEntry`, `ProjectDirectoryListing`, and `ProjectFilePreview` types exported from the runtime shape.

- [x] **Step 4: Add API routes**

In `src/server/index.ts`:

- Import `listProjectFiles` and `previewProjectFile` from `../runtime/project-files.js`.
- Add `projectForFileRequest(request, response, user)` helper or inline logic that:
  - Reads `request.params.projectId`.
  - Calls `getProject(projectId, runtime)`.
  - Checks `userCanAccessProject(user, project.id)`.
  - Returns 403 with `{ error: "Project access denied" }` when denied.
- Add:

```ts
app.get("/api/projects/:projectId/files", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  try {
    const project = getProject(request.params.projectId, runtime);
    if (!userCanAccessProject(user, project.id)) {
      response.status(403).json({ error: "Project access denied" });
      return;
    }
    const path = typeof request.query.path === "string" ? request.query.path : "";
    response.json(await listProjectFiles(project, path));
  } catch {
    response.status(400).json({ error: "File is not available" });
  }
});

app.get("/api/projects/:projectId/files/preview", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  try {
    const project = getProject(request.params.projectId, runtime);
    if (!userCanAccessProject(user, project.id)) {
      response.status(403).json({ error: "Project access denied" });
      return;
    }
    const path = typeof request.query.path === "string" ? request.query.path : "";
    response.json(await previewProjectFile(project, path));
  } catch {
    response.status(400).json({ error: "File is not available" });
  }
});
```

- [x] **Step 5: Run focused E2E to verify GREEN**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts -g "project file API is scoped"
```

Expected: PASS.

- [x] **Step 6: Run unit tests**

Run:

```bash
scripts/test
```

Expected: PASS.

- [x] **Step 7: Update this plan checklist**

Mark Task 2 steps complete.

- [x] **Step 8: Include API slice in the final feature commit**

Run:

```bash
git add src/server/index.ts src/client/src/client-types.ts e2e/project-management.spec.ts docs/superpowers/plans/2026-07-03-project-file-browser.md
git commit -m "feat: expose project file browser API"
```

## Task 3: Vue Drawer UI

**Files:**
- Create: `src/client/src/components/ProjectFilesDrawer.vue`
- Modify: `src/client/src/App.vue`
- Modify: `src/client/src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Write failing component/source tests**

Append to `src/client-interface-style.test.ts`:

```ts
test("client exposes project file browser drawer hooks", () => {
  const appSource = readFileSync("src/client/src/App.vue", "utf8");
  const drawerSource = readFileSync("src/client/src/components/ProjectFilesDrawer.vue", "utf8");
  const cssSource = readFileSync("src/client/src/styles.css", "utf8");

  assert.match(appSource, /ProjectFilesDrawer/);
  assert.match(appSource, /projectFilesOpen/);
  assert.match(appSource, /Open project files/);
  assert.match(drawerSource, /\/api\/projects\/.*\/files/);
  assert.match(drawerSource, /Copy Path/);
  assert.match(drawerSource, /Copy Content/);
  assert.match(drawerSource, /Project file search/);
  assert.match(cssSource, /\.project-files-drawer/);
  assert.match(cssSource, /\.project-files-resize-handle/);
});
```

- [x] **Step 2: Run focused test to verify RED**

Run:

```bash
pnpm exec tsx --test src/client-interface-style.test.ts
```

Expected: FAIL because `ProjectFilesDrawer.vue` does not exist.

- [x] **Step 3: Create ProjectFilesDrawer component**

Create `src/client/src/components/ProjectFilesDrawer.vue` with these behaviors:

- Props:
  - `open: boolean`
  - `project?: ProjectConfig`
  - `width: number`
- Emits:
  - `close`
  - `update:width`
- State:
  - `listing: ProjectDirectoryListing | null`
  - `preview: ProjectFilePreview | null`
  - `selectedEntry: ProjectFileEntry | null`
  - `currentPath: string`
  - `filterText: string`
  - `loading`, `previewLoading`, `errorMessage`, `copyStatus`
- Watch `[open, project?.id]`; when open and project exists, reset path to root and fetch listing.
- `loadDirectory(path = "")` fetches `/api/projects/${project.id}/files?path=...`.
- `loadPreview(entry)` fetches `/api/projects/${project.id}/files/preview?path=...`.
- `filteredEntries` filters `listing.entries` by lowercase filename.
- `copyPath()` copies `selectedEntry.relativePath || "."`.
- `copyContent()` only copies `preview.content` when `preview.previewable && preview.content`.
- Drag handle listens on `pointerdown`, then window `pointermove` computes `nextWidth = clamp(window.innerWidth - event.clientX, 360, Math.min(860, window.innerWidth - 96))`, emits width, and removes listeners on pointerup.
- Template uses `role="dialog"` and `aria-label="Project files"`.

- [x] **Step 4: Wire App topbar state**

In `src/client/src/App.vue`:

- Import `ProjectFilesDrawer`.
- Add:

```ts
const projectFilesOpen = ref(false);
const projectFilesWidth = ref(Number(localStorage.getItem("tycho-project-files-width")) || 560);
```

- Add functions:

```ts
function openProjectFiles(): void {
  if (selectedProject.value) {
    projectFilesOpen.value = true;
  }
}

function setProjectFilesWidth(width: number): void {
  projectFilesWidth.value = width;
  localStorage.setItem("tycho-project-files-width", String(width));
}
```

- Add a button immediately after `ProjectSwitcher`:

```vue
<button
  v-if="isWorkspaceRoute"
  class="icon-text-button"
  type="button"
  :disabled="!selectedProject"
  aria-label="Open project files"
  @click="openProjectFiles"
>
  Files
</button>
```

- Mount:

```vue
<ProjectFilesDrawer
  :open="projectFilesOpen"
  :project="selectedProject"
  :width="projectFilesWidth"
  @close="projectFilesOpen = false"
  @update:width="setProjectFilesWidth"
/>
```

- [x] **Step 5: Add drawer styles**

In `src/client/src/styles.css`, add styles for:

- `.icon-text-button`
- `.project-files-backdrop`
- `.project-files-drawer`
- `.project-files-resize-handle`
- `.project-files-header`
- `.project-files-path`
- `.project-files-search`
- `.project-files-list`
- `.project-file-row`
- `.project-file-row.selected`
- `.project-files-preview`
- `.project-preview-content`
- Light theme variants under `[data-interface-style="light"]`

Use existing theme variables where possible. Avoid nested cards. Keep drawer fixed right, top below topbar, bottom 0, width from CSS var `--project-files-width`.

- [x] **Step 6: Run focused component/source test to verify GREEN**

Run:

```bash
pnpm exec tsx --test src/client-interface-style.test.ts
```

Expected: PASS.

- [x] **Step 7: Run typecheck**

Run:

```bash
scripts/typecheck
```

Expected: PASS.

- [x] **Step 8: Update this plan checklist**

Mark Task 3 steps complete.

- [x] **Step 9: Include UI slice in the final feature commit**

Run:

```bash
git add src/client/src/components/ProjectFilesDrawer.vue src/client/src/App.vue src/client/src/styles.css src/client-interface-style.test.ts docs/superpowers/plans/2026-07-03-project-file-browser.md
git commit -m "feat: add project files drawer"
```

## Task 4: End-to-End File Browser Workflow

**Files:**
- Modify: `e2e/project-management.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Add failing E2E workflow tests**

Append:

```ts
test("opens project files drawer, filters, previews, and blocks sensitive preview", async ({ page }) => {
  const projectPath = makeProjectDir();
  mkdirSync(join(projectPath, "src"));
  writeFileSync(join(projectPath, "src", "visible.txt"), "hello from project files");
  writeFileSync(join(projectPath, "src", "hidden-note.md"), "not the selected file");
  writeFileSync(join(projectPath, ".env.local"), "TOKEN=secret");

  await login(page, "admin", "admin");
  await addManagedProject(page, "E2E Files Drawer", projectPath);
  await page.goto("/");
  await selectWorkspaceProject(page, "E2E Files Drawer");

  await page.getByRole("button", { name: "Open project files" }).click();
  const drawer = page.getByRole("dialog", { name: "Project files" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Open src" }).click();
  await drawer.getByLabel("Project file search").fill("visible");
  await expect(drawer.getByRole("button", { name: /Preview visible.txt/ })).toBeVisible();
  await expect(drawer.getByText("hidden-note.md")).toHaveCount(0);
  await drawer.getByRole("button", { name: /Preview visible.txt/ }).click();
  await expect(drawer.getByText("hello from project files")).toBeVisible();
  await drawer.getByRole("button", { name: "Copy Content" }).click();
  await expect(drawer.getByText("Content copied")).toBeVisible();

  await drawer.getByRole("button", { name: "Up" }).click();
  await drawer.getByLabel("Project file search").fill(".env");
  await drawer.getByRole("button", { name: /Preview .env.local/ }).click();
  await expect(drawer.getByText("Sensitive file cannot be previewed")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Copy Content" })).toBeDisabled();

  await deleteManagedProjectsByName(page, ["E2E Files Drawer"]);
});

test("switching project resets an open file drawer", async ({ page }) => {
  const firstPath = makeProjectDir();
  const secondPath = makeProjectDir();
  writeFileSync(join(firstPath, "first.txt"), "first");
  writeFileSync(join(secondPath, "second.txt"), "second");

  await login(page, "admin", "admin");
  await addManagedProject(page, "E2E First Files", firstPath);
  await addManagedProject(page, "E2E Second Files", secondPath);
  await page.goto("/");
  await selectWorkspaceProject(page, "E2E First Files");
  await page.getByRole("button", { name: "Open project files" }).click();
  const drawer = page.getByRole("dialog", { name: "Project files" });
  await expect(drawer.getByText("first.txt")).toBeVisible();

  await selectWorkspaceProject(page, "E2E Second Files");
  await expect(drawer.getByText("second.txt")).toBeVisible();
  await expect(drawer.getByText("first.txt")).toHaveCount(0);

  await deleteManagedProjectsByName(page, ["E2E First Files", "E2E Second Files"]);
});
```

- [x] **Step 2: Run focused E2E to verify RED or catch integration gaps**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts -g "project files drawer|switching project resets"
```

Expected: PASS if Task 3 already covered behavior; otherwise FAIL on missing/incorrect UI details.

- [x] **Step 3: Fix UI/API gaps minimally**

Adjust labels/selectors/behavior only as required by the E2E tests:

- Ensure file rows expose button labels `Preview ${entry.name}`.
- Ensure directory rows expose button labels `Open ${entry.name}`.
- Ensure sensitive preview message is exactly `Sensitive file cannot be previewed`.
- Ensure copy success text is exactly `Content copied`.
- Ensure project switch reloads root listing.

- [x] **Step 4: Run focused E2E to verify GREEN**

Run:

```bash
pnpm exec playwright test e2e/project-management.spec.ts -g "project files drawer|switching project resets"
```

Expected: PASS.

- [x] **Step 5: Run build**

Run:

```bash
scripts/build
```

Expected: PASS.

- [x] **Step 6: Update this plan checklist**

Mark Task 4 steps complete.

- [x] **Step 7: Include E2E slice in the final feature commit**

Run:

```bash
git add e2e/project-management.spec.ts src/client/src/components/ProjectFilesDrawer.vue src/client/src/App.vue src/client/src/styles.css docs/superpowers/plans/2026-07-03-project-file-browser.md
git commit -m "test: cover project file browser workflow"
```

## Task 5: Final Verification and Review

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Run full verification**

Run:

```bash
scripts/verify
```

Expected: PASS.

- [x] **Step 2: Run pre-commit hook**

Run:

```bash
.githooks/pre-commit
```

Expected: PASS.

- [x] **Step 3: Request final code/security/architecture review**

Dispatch a reviewer with:

- Spec: `docs/superpowers/specs/2026-07-03-project-file-browser-design.md`
- Plan: `docs/superpowers/plans/2026-07-03-project-file-browser.md`
- Base SHA: `origin/main`
- Head SHA: current branch HEAD
- Focus: path traversal, project access control, sensitive file preview blocking, UI state, test coverage, and architectural separation from `directory-browser.ts`.

- [x] **Step 4: Fix review findings**

If reviewer reports Critical or Important findings, fix them with focused tests first, then rerun relevant tests and `scripts/verify`.

- [x] **Step 5: Mark final checklist complete**

Update Task 5 in this plan.

- [x] **Step 6: Include verification updates in the final feature commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-project-file-browser.md
git commit -m "docs: complete project file browser plan"
```

If only checklist updates changed and they were already included in prior commits, this final commit can be skipped.

## Task 6: Drawer Body Full-Height Follow-Up

**Files:**
- Modify: `src/client-interface-style.test.ts`
- Modify: `src/client/src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-03-project-file-browser.md`

- [x] **Step 1: Add a failing layout regression test**

Run:

```bash
pnpm exec tsx --test src/client-interface-style.test.ts
```

Expected before implementation: FAIL because the drawer body still uses an upper file-list row and lower preview row.

- [x] **Step 2: Make the drawer body use full-height columns**

Change the project files body to a two-column grid on normal viewports so the file list and preview both fill the drawer height. Keep a narrow viewport fallback that stacks list and preview.

- [x] **Step 3: Run focused and full verification**

Run:

```bash
pnpm exec tsx --test src/client-interface-style.test.ts
pnpm run build
pnpm run verify
```

Expected: PASS.
