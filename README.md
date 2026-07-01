# Tycho

Tycho is a browser-based observatory for server-side TUI coding agents.

It implements the shape:

```text
Browser -> Web workbench with multiple terminal panels -> server-side tuimux -> CodeBuddy / Codex / Claude TUI CLIs
```

The browser never runs the coding agent directly. Each panel is an xterm view that streams bytes to and from a real PTY owned by `tuimux` on the server.

## Architecture

- `tuimux` runs as an isolated session server with `XDG_CONFIG_HOME` and `XDG_STATE_HOME` under `.tuimux/`.
- `src/tuimux/client.ts` connects to `tuimux` over its newline-delimited JSON Unix socket.
- `src/server/index.ts` exposes HTTP and WebSocket endpoints.
- `src/client/` contains the Vue + Vite browser app that renders xterm panels and forwards keyboard input to the matching tuimux pane.

## Project Layout

```text
src/client/         Vue + Vite browser UI, xterm setup, and styles
src/runtime/        Runtime config, project allowlist, agent entries
src/server/         Express HTTP API and WebSocket bridge
src/shared/         Shared filesystem paths
src/scripts/        Local maintenance/setup scripts
src/tuimux/         Tuimux socket client and session state adapter
```

The tuimux socket messages used by this PoC are:

- `create_window`: start a new server-side TUI for an agent entry.
- `input`: write raw keyboard data into a pane PTY.
- `resize_pane`: resize the pane PTY when the browser panel changes size.
- `pane_output`: stream PTY output back to browser terminals.

## Run

```bash
pnpm install
pnpm run dev
```

Open:

```text
http://localhost:3107
```

Click `CodeBuddy`, `Codex`, or `Claude` to create independent server-side TUI sessions.

## Verification

```bash
pnpm run typecheck
pnpm test
pnpm run verify
```

- `typecheck`: server TypeScript and Vue client strict type checking without emitting files.
- `test`: Node's built-in test runner with `tsx` for TypeScript tests.
- `verify`: lint, typecheck, tests, Playwright E2E, and production build.

## Projects

Sessions always start inside a server-configured project directory. The browser can only choose a `projectId` from the server-provided allowlist; it cannot send arbitrary commands or arbitrary working directories.

By default, the only project is this repository directory.

Configure multiple projects with `PROJECTS_JSON`:

```bash
PROJECTS_JSON='[
  {"id":"tycho","name":"tycho","path":"/Users/robiluo/aicoding/tycho"},
  {"id":"other-app","name":"other-app","path":"/Users/robiluo/aicoding/other-app"}
]' pnpm run dev
```

Or with path-delimited `PROJECT_DIRS`:

```bash
PROJECT_DIRS="/Users/robiluo/aicoding/tycho:/Users/robiluo/aicoding/other-app" pnpm run dev
```

Set the initial selection:

```bash
DEFAULT_PROJECT_ID=tycho pnpm run dev
```

## Agent Commands

Defaults:

- `codebuddy`
- `codex`
- `claude`

Override them with environment variables:

```bash
CODEBUDDY_CMD=/path/to/codebuddy CODEX_CMD=codex CLAUDE_CMD=claude pnpm run dev
```

Arguments are separate:

```bash
CODEX_ARGS="--model gpt-5" pnpm run dev
```

The agent working directory is chosen from the selected project. The old `AGENT_WORKDIR` fallback is only used when no explicit project list is configured:

```bash
AGENT_WORKDIR=/path/to/project pnpm run dev
```

## Useful Commands

Generate the tuimux config:

```bash
pnpm run setup:tuimux
```

Open the native tuimux UI against the same isolated config/state:

```bash
pnpm run tui
```

Shutdown the isolated tuimux server:

```bash
pnpm run tuimux:shutdown
```

## Notes

This intentionally treats tuimux as the source of truth for TUI process management. The Web app is a remote view/controller over tuimux panes, so multiple browser panels and the native tuimux UI can observe the same underlying server-side sessions.
