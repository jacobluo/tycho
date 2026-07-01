# Authentication And Project RBAC Spec

## Goal

Add login and role-based access control to Tycho so administrators can manage projects and assign project access to ordinary users.

## Requirements

- Users authenticate with username and password.
- Roles are `admin` and `user`.
- The first startup bootstraps an administrator in the local SQLite database:
  - username from `TYCHO_ADMIN_USERNAME`, default `admin`
  - password from `TYCHO_ADMIN_PASSWORD`, default `admin`
- Auth state is stored in an HTTP-only same-site session cookie with a 7 day expiry.
- Unauthenticated browser requests cannot access project config, project management, session creation, or WebSocket control.
- Admin users can:
  - see all projects
  - add and delete managed projects
  - create users
  - create both admin and ordinary users
  - update user passwords
  - update user roles
  - disable and enable users
  - soft-delete users
  - assign projects to ordinary users
- Ordinary users can:
  - see only assigned projects
  - create sessions only for assigned projects
  - not add/delete projects
  - not manage users or assignments
- Browser code continues to call only Tycho's own APIs and WebSocket endpoint.
- Passwords are stored as salted hashes, never plaintext.
- Ordinary users default to no project access until an administrator assigns projects.
- Removing a project assignment restricts new sessions only; already-open sessions remain usable until closed.
- Deleted users are soft-deleted. Their sessions and assignments are removed, and their usernames cannot be reused.
- Ordinary users with no assignments see an empty project state and cannot start agents.

## Non-Goals

- No external identity provider.
- No password reset flow.
- No self-service registration.
- No fine-grained per-agent permission model.
- No immediate termination of already-open TUI sessions when an assignment is revoked.

## Test Coverage

- Unit tests cover password hashing, login success/failure, session lookup, user creation, and project assignment.
- E2E covers admin login, project creation, user creation, project assignment, logout, ordinary user login, and restricted project visibility.
- E2E covers ordinary users being denied admin project management.
