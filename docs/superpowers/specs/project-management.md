# Project Management Spec

## Goal

Tycho users can manage the server-side project allowlist from the browser by adding local project directories with a name and description.

## Requirements

- The browser can submit a project name, local filesystem path, and optional description.
- The server validates that the submitted path exists and is a directory before adding it to the runtime project list.
- Managed projects are persisted in a local SQLite database under `.tuimux/`.
- Managed projects appear in the project selector without restarting the server.
- Managed projects can be deleted from Tycho without deleting files from disk.
- Environment-configured projects remain available and cannot be deleted through the browser.

## Security Boundaries

- The browser cannot submit arbitrary shell commands, environment variables, or agent commands.
- The submitted path is only used after server-side validation and only as a project working directory for allowlisted agents.
- API errors returned to the browser must be stable validation messages, not internal stacks, SQL, or debug details.

## Test Coverage

- Unit tests cover SQLite persistence, descriptions, duplicate path rejection, and delete behavior.
- E2E tests cover adding and deleting a project through the UI.
- E2E tests cover the high-risk failure path for an invalid local path.
