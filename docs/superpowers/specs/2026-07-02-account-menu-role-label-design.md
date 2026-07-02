# Account Menu Role Label Design

## Goal

Make the account menu trigger clearly show username and role without looking like `username/password`.

## Design

The account trigger should show:

- username as the primary text
- localized role label as a separate badge

Role labels:

- `admin` -> `管理员`
- `user` -> `普通用户`

The trigger must no longer render `username / role`, because `admin / admin` is easily mistaken for the default credential pair.

## Testing

Playwright should locate the account menu by the new accessible name, such as `admin 管理员` and `alice 普通用户`, and should no longer depend on slash-separated role text.
