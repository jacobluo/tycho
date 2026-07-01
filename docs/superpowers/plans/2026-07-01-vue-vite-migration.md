# Vue Vite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tycho's plain browser UI with Vue 3 + Vite while preserving the existing API, WebSocket, xterm, and project management workflows.

**Architecture:** Keep Express as the API/WebSocket owner. In development, Express mounts Vite middleware for the Vue app; in production, Express serves Vite's `dist/client` output. The Vue app owns browser state and xterm lifecycle through composition functions and typed API/WebSocket helpers.

**Tech Stack:** Vue 3, Vite, TypeScript, `@xterm/xterm`, Express, Playwright, Node test runner.

---

### Task 1: Add Red E2E Coverage For Vue Boot

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] Add an E2E assertion that `window.__TYCHO_CLIENT__` equals `vue-vite`.
- [x] Run `scripts/e2e` and confirm it fails because the legacy client does not set the Vue/Vite marker.

### Task 2: Add Vue/Vite Tooling

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vite.config.ts`
- Create: `tsconfig.client.json`
- Create: `src/client/env.d.ts`
- Modify: `scripts/typecheck`
- Modify: `scripts/build`

- [x] Add `vue`, `@vitejs/plugin-vue`, `vite`, and `vue-tsc`.
- [x] Configure Vite to use `src/client` as the frontend root and emit production files to `dist/client`.
- [x] Configure client TypeScript checking for `.vue` files.
- [x] Update scripts so `scripts/typecheck` runs both server and Vue typechecks, and `scripts/build` runs Vite build plus server build.

### Task 3: Implement Vue Client

**Files:**
- Create: `src/client/index.html`
- Create: `src/client/src/main.ts`
- Create: `src/client/src/App.vue`
- Create: `src/client/src/styles.css`
- Delete: `public/index.html`
- Delete: `public/app.js`
- Delete: `public/styles.css`

- [x] Port current layout and visible copy into Vue.
- [x] Port project selector, add/delete project form, and status messages.
- [x] Port WebSocket config/state/pane output handling.
- [x] Port xterm terminal lifecycle with Vue refs and cleanup.
- [x] Set `window.__TYCHO_CLIENT__ = "vue-vite"` when the client boots.

### Task 4: Connect Express To Vite

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/shared/paths.ts`

- [x] Add shared path for `dist/client`.
- [x] Mount Vite middleware in development.
- [x] Serve `dist/client` static files in production.
- [x] Preserve all existing `/api/*` routes and `/ws` WebSocket behavior.

### Task 5: Update Documentation And Rules

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `.codebuddy/rules/testing.mdc`

- [x] Replace plain-frontend wording with Vue + Vite.
- [x] Update project layout to mention `src/client`.
- [x] Replace React-specific testing language with framework-neutral frontend component language.

### Task 6: Verify And Commit

**Files:**
- All changed files

- [x] Run `scripts/e2e` and confirm Vue boot, add/delete, and invalid path tests pass.
- [x] Run `scripts/verify`.
- [x] Run `.githooks/pre-commit`.
- [x] Commit as `feat: migrate frontend to vue vite`.
