# Project File Browser Drawer Design

## Context

Tycho's Workspace is centered on a selected project and one or more server-side TUI sessions. Users often need to quickly inspect project files while keeping the TUI visible. The current directory picker is an admin-only helper for choosing a project path; it is not a workspace file browser and should remain separate.

## Goal

Add a right-side file browser drawer next to the topbar project switcher. The drawer is a read-only, current-project file inspector for quick file lookup and text preview.

## Decisions From Brainstorming

- Use the recommended right-side file browser drawer.
- Scope is quick file content viewing, not file management.
- The drawer previews files internally; it does not replace or resize the TUI workspace.
- Preview is plain text in a monospace area, without syntax highlighting.
- The browser is strictly bound to the project selected in the topbar.
- Show most hidden files and directories.
- Sensitive files are visible in the directory list but cannot be previewed or copied.
- Preview returns at most 256 KB and shows a truncation state when larger content exists.
- Current directory search filters filenames on the client; no recursive project search in the first version.
- Drawer width is draggable with minimum and maximum bounds.
- Actions include Preview, Refresh, Copy Path, Copy Content, and Close.

## Non-Goals

- Do not add create, edit, delete, rename, chmod, upload, or download actions.
- Do not expose arbitrary absolute path browsing.
- Do not add syntax highlighting or Markdown rendering in the first version.
- Do not search recursively across the whole project.
- Do not preview sensitive files, even for admins.
- Do not expose file owner, permissions, or raw filesystem errors.

## User Experience

The Workspace topbar shows the custom project switcher and a new Files button beside it. The button is disabled when no project is selected. Clicking it opens a right-side drawer over the workspace.

The drawer contains:

- Header with the selected project name, current relative path, Refresh, and Close.
- A draggable left edge that resizes the drawer on desktop.
- A search field that filters the current directory by filename.
- Directory rows with folder/file indicators, name, relative path, and lightweight metadata.
- Up navigation for returning to the parent directory.
- Preview panel for the selected file.
- Action buttons for Preview, Copy Path, Copy Content, and Refresh.

Clicking a directory enters it. Clicking a file selects and previews it. The Preview button reloads the selected file. Copy Path copies the project-relative path. Copy Content copies the currently loaded preview content only when content is available.

When the selected project changes while the drawer is open, the drawer resets to the new project's root and clears the preview.

On narrow screens, the drawer may occupy the full width and skip drag resizing.

## Server API

The browser talks to project-scoped APIs. The client never sends absolute paths.

```http
GET /api/projects/:projectId/files?path=relative/path
GET /api/projects/:projectId/files/preview?path=relative/file.txt
```

`GET /files` response:

```ts
type ProjectFileEntry = {
  name: string;
  relativePath: string;
  type: "directory" | "file";
  size: number | null;
  modifiedAt: string | null;
  sensitive: boolean;
};

type ProjectDirectoryListing = {
  projectId: string;
  projectName: string;
  currentPath: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};
```

`GET /files/preview` response:

```ts
type ProjectFilePreview = {
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

The preview endpoint returns `previewable: false` with an empty `content` for sensitive, directory, binary, or unavailable files. For text files larger than 256 KB, it returns the first 256 KB, `previewable: true`, and `truncated: true`.

## Security

- Both endpoints require authentication.
- The server checks `userCanAccessProject(user, projectId)` before reading anything.
- Admins and ordinary users follow the same project access rule for these endpoints.
- Server resolves paths from `project.path + relativePath`; it never trusts client absolute paths.
- Server uses `realpath` containment checks so symlinks cannot escape the project root.
- Directory listing can show sensitive filenames, but preview content for sensitive files is blocked.
- Sensitive filenames include `.env`, `.env.*`, and names containing `secret`, `token`, `credential`, `private`, or `key` case-insensitively.
- Errors return generic user-facing messages such as `File is not available`.
- The API is read-only.

## Implementation Notes

Create a new runtime module for project file browsing instead of expanding the existing directory picker module. The existing `directory-browser.ts` remains focused on admin project path selection.

Expected files:

- `src/runtime/project-files.ts`
- `src/runtime/project-files.test.ts`
- `src/server/index.ts`
- `src/client/src/client-types.ts`
- `src/client/src/components/ProjectFilesDrawer.vue`
- `src/client/src/App.vue`
- `src/client/src/views/WorkspaceView.vue`
- `src/client/src/styles.css`
- `e2e/project-management.spec.ts`

## Testing

Unit tests cover:

- Listing project root entries.
- Sorting directories before files, then by name.
- Client relative paths cannot escape the project root.
- Symlinks that resolve outside the project root are rejected.
- Sensitive files appear in listings but previews are blocked.
- Text previews are capped at 256 KB and report truncation.
- Binary previews are blocked.

E2E tests cover:

- Admin opens the drawer from the Workspace topbar and previews a text file in the selected project.
- Current directory search filters visible filenames.
- Switching projects resets the drawer to the new project.
- Ordinary users can browse assigned projects and cannot browse unassigned projects through the API.
- Sensitive files are listed but cannot be previewed or copied.
