# Project Management Plan

## Files

- `src/runtime/config.ts`: SQLite-backed managed projects, validation, public runtime config.
- `src/runtime/config.test.ts`: unit coverage for persistence and validation.
- `src/server/index.ts`: project create/delete APIs and config broadcast.
- `public/index.html`: project management form.
- `public/app.js`: project create/delete UI behavior.
- `public/styles.css`: form and status styling.
- `playwright.config.ts`: browser E2E config.
- `e2e/project-management.spec.ts`: project management workflow coverage.
- `scripts/e2e`: run Playwright tests.
- `.githooks/pre-commit`: run full verification before commit.

## Steps

- [x] Add a local SQLite project database under `.tuimux/`.
- [x] Extend runtime project config with optional descriptions and managed markers.
- [x] Add server APIs to create and delete managed projects.
- [x] Add browser UI for project name, local path, and description.
- [x] Add unit tests for persistence, duplicate path rejection, and delete behavior.
- [x] Add Playwright E2E coverage for add/delete happy path.
- [x] Add Playwright E2E coverage for invalid path failure path.
- [x] Add `.githooks/pre-commit` verification hook.
- [x] Run `scripts/test`, `scripts/e2e`, and `scripts/verify`.

## Expected Results

- `scripts/test` passes all unit tests.
- `scripts/e2e` runs real Playwright tests against the local Tycho server.
- `scripts/verify` covers lint/typecheck, unit tests, E2E, and build.
