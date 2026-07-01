# Tycho Agent Guide

This repository is a TypeScript/Node proof of concept for Tycho, a browser-based observatory for server-side TUI coding agents.

## Product Shape

```text
Browser xterm panels -> Express/WebSocket server -> tuimux Unix socket -> server-side PTYs for CodeBuddy/Codex/Claude
```

The browser is not a general shell. It can only select a server-configured project and request one of the allowlisted agents.

## Rule Sources

Before coding, read and follow:

- `.codebuddy/rules/workflow.mdc`
- `.codebuddy/rules/testing.mdc`
- `.codebuddy/rules/security.mdc`

## Project Layout

- `public/`
  - Browser UI, xterm setup, WebSocket client, styles.
- `src/runtime/`
  - Runtime config, project allowlist, agent definitions, session entry creation.
- `src/server/`
  - Express routes and WebSocket bridge.
- `src/shared/`
  - Shared filesystem paths.
- `src/tuimux/`
  - Tuimux socket client and session state adapter.
- `src/scripts/`
  - Local setup/maintenance scripts.
- `scripts/`
  - Canonical local development and verification command entrypoints.

## Core Commands

```bash
pnpm run typecheck
pnpm test
pnpm run build
pnpm run verify
```

Use `pnpm run dev` only when you need to run the local web server. Stop it before handing off if the user asks to stop servers.

## Runtime Configuration

Projects are a server-side allowlist:

- `PROJECTS_JSON`: JSON array of `{ "id", "name", "path" }`.
- `PROJECT_DIRS`: path-delimited list of project directories.
- `DEFAULT_PROJECT_ID`: initial selected project.

Agent commands are also server-side:

- `CODEBUDDY_CMD`, `CODEBUDDY_ARGS`
- `CODEX_CMD`, `CODEX_ARGS`
- `CLAUDE_CMD`, `CLAUDE_ARGS`

Do not add browser features that accept arbitrary shell commands, arbitrary paths, or raw environment variables from the client.

## Current Design Decisions

- Frontend uses plain HTML/CSS/JS plus `@xterm/xterm`.
- Backend uses Express and `ws`.
- Tuimux is treated as the source of truth for server-side TUI process/session management.
- The isolated tuimux config/state lives under `.tuimux/`.
- `tuimux.yaml`, `dist/`, `.tuimux/`, `.playwright-mcp/`, and `node_modules/` are generated/local artifacts and should not be committed.
