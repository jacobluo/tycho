# Project Directory Browser Design

## Context

Project Management currently asks admins to type a local path when adding or editing a project. That works for power users, but it is clumsy and error-prone when Tycho is deployed as a browser UI for server-side projects.

The requested workflow is a server-side folder picker similar to a file manager: admins can browse allowed folders, expand into child directories, and use the selected directory as the project path.

## Goals

- Add a tree/list directory picker to the Project Management add/edit drawer.
- Let admins choose a server-side directory without typing the full path manually.
- Keep the existing text path input for paste/edit workflows.
- Keep project creation and editing flowing through the existing project validation and save APIs.
- Prevent the browser from enumerating arbitrary server filesystem paths.

## Non-Goals

- Do not expose file contents.
- Do not upload local browser files or use the browser's local file picker.
- Do not allow ordinary users to browse server directories.
- Do not recursively scan entire directory trees in one request.
- Do not replace the existing typed path input.

## Recommended Approach

Use a lazy server-side directory browser constrained by explicit configured roots.

Alternative 1, text-only path input, is already implemented but does not solve discoverability.

Alternative 2, native browser file picker, would browse the user's client machine, not the Tycho server, so it is the wrong boundary.

Alternative 3, unrestricted server filesystem browser, would be convenient but unsafe for internet deployment.

The recommended approach is safest: the server exposes only directories under configured roots, and the UI loads one folder level at a time.

## Configuration

Add:

```bash
PROJECT_BROWSER_ROOTS=/Users/robiluo2:/srv/projects
```

Rules:

- Split by the platform path delimiter, matching `PROJECT_DIRS`.
- Resolve each root to a real path at startup/request time.
- Ignore empty entries.
- In production, if `PROJECT_BROWSER_ROOTS` is unset, directory browsing is disabled.
- In development, if `PROJECT_BROWSER_ROOTS` is unset, default to the server process home directory when available, otherwise the current project root.
- Project save validation remains unchanged: a chosen path must still exist and be a directory.

## Server API

Add an admin-only route:

```http
GET /api/directories?path=/allowed/root/or/child
```

When `path` is omitted:

- Return configured root directories as selectable entries.
- Do not enumerate `/`.

When `path` is present:

- Resolve and `realpath` the requested directory.
- The real path must be equal to or nested under one configured root.
- Return `403` if outside all roots.
- Return `404` if the directory does not exist.
- Return `400` if the path is not a directory.

Response shape:

```ts
type DirectoryBrowserEntry = {
  name: string;
  path: string;
};

type DirectoryBrowserResponse = {
  roots: DirectoryBrowserEntry[];
  currentPath: string | null;
  parentPath: string | null;
  entries: DirectoryBrowserEntry[];
};
```

Entry rules:

- Return directories only.
- Sort directories by name.
- Omit entries the process cannot stat or read.
- Omit symlinks that resolve outside configured roots.
- Do not include hidden metadata, permissions, file sizes, owner names, or file contents.
- Cap returned entries to a documented maximum, such as 500, to avoid slow or noisy directories.

## Frontend UX

In `ProjectManagementView.vue`, the `Local Path` field becomes:

- A text input, still editable.
- A `Browse` button beside it.

Clicking `Browse` opens a directory picker drawer/modal:

- Header: `Choose Project Folder`.
- Path bar showing the current folder.
- Root selector or root list when no folder is selected.
- Back/up button when a parent is available.
- Scrollable directory rows with folder icons.
- Single click selects a row and previews the path.
- Double click or row action enters that folder.
- Footer buttons: `Cancel` and `Use This Folder`.

Applying a folder:

- Copies the selected directory path into `projectForm.path`.
- Closes the picker.
- Does not save the project automatically.
- The admin still clicks `Save Project`, preserving current validation and status handling.

Failure states:

- If browsing is disabled, hide `Browse` or show it disabled with a short tooltip/title.
- If an API request fails, show a non-sensitive error such as `Directory is not available`.
- If a directory is empty, show an empty state inside the picker.
- If the selected path later fails save validation, reuse existing project form errors.

## Security

- `GET /api/directories` must use `requireAdmin`.
- The client must never send shell commands.
- The server must never expose raw stack traces or internal path errors.
- Path containment must use `realpath`, not string prefix checks alone.
- Symlink targets outside configured roots must be hidden or rejected.
- The browser only receives directory names and canonical paths inside allowed roots.
- This API is read-only and must not create, rename, delete, chmod, or write filesystem entries.

## Implementation Plan Shape

Expected files:

- `src/runtime/directory-browser.ts`: root parsing, path containment, directory listing.
- `src/runtime/directory-browser.test.ts`: unit tests for roots, symlink escape, disabled config, and listing behavior.
- `src/server/index.ts`: admin-only `GET /api/directories`.
- `src/client/src/client-types.ts`: directory browser response types.
- `src/client/src/components/DirectoryPickerDialog.vue`: reusable picker UI.
- `src/client/src/views/ProjectManagementView.vue`: Browse button and picker integration.
- `src/client/src/styles.css`: directory picker styles.
- `e2e/project-management.spec.ts`: add/edit project path selection through Browse.

## Testing

Unit tests:

- Browsing is disabled in production when no roots are configured.
- Development fallback root is limited to the project root.
- Listing returns directories only.
- Requests outside configured roots are rejected.
- Symlink escapes are rejected or omitted.
- Inaccessible children are omitted without failing the full listing.

E2E tests:

- Admin can open Browse from Add Project, select a folder, and save a project.
- Admin can open Browse from Edit Project and update the path.
- Ordinary users cannot call the directory API.
- Invalid/out-of-root directory API requests do not expose sensitive details.
