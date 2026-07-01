# Account Menu And Password Change Design

## Goal

Move account actions into a top-right user menu and add self-service password change.

## Design

Authenticated pages show account actions in the right side of the workspace header instead of the sidebar. The trigger displays the current username and role. Opening it shows:

- `Change Password`
- `Admin Management` for admin users only
- `Log Out`

The sidebar keeps operational navigation and status only. Admin management is still the existing dedicated management view, but it is opened from the account menu instead of a sidebar `Manage` button.

## Password Change

Users change their own password through a modal launched from the account menu. The modal asks for:

- current password
- new password

The server exposes an authenticated endpoint that verifies the current password before replacing the password hash. A failed current password returns `401` without changing the password. A successful change keeps the current session active.

## Testing

- Unit tests cover successful self-password change and rejection when the current password is wrong.
- E2E covers opening the top-right menu, opening admin management from the menu, changing password, logging out, failing with the old password, and logging in with the new password.
- Existing admin/project/user E2E flows should use the account menu for management and logout.
