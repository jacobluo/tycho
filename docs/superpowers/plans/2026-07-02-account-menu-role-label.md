# Account Menu Role Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace slash-separated account menu text with clear username plus localized role badge.

**Architecture:** Update the existing `AccountMenu.vue` component and its Playwright selectors. No backend changes are required.

**Tech Stack:** Vue 3, Playwright, existing Tycho CSS.

---

### Task 1: Update Tests

**Files:**
- Modify: `e2e/project-management.spec.ts`

- [x] Update login helper to expect `admin 管理员` or `<user> 普通用户`.
- [x] Update account menu helper to find the new accessible button name.
- [x] Update password-change assertion for ordinary user account display.
- [x] Run `scripts/e2e` and confirm failure is due to old slash-separated UI.

### Task 2: Update Account Menu UI

**Files:**
- Modify: `src/client/src/components/AccountMenu.vue`
- Modify: `src/client/src/styles.css`

- [x] Add role label mapping for `admin` and `user`.
- [x] Render username and role badge as separate spans.
- [x] Add compact badge styling.
- [x] Run `scripts/typecheck` and `scripts/e2e`.

### Task 3: Verify And Commit

**Files:**
- All changed files

- [x] Run `scripts/verify`.
- [x] Run `.githooks/pre-commit`.
- [x] Commit as `fix: clarify account menu role label`.
