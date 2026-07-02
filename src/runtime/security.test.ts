import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isAllowedWebSocketOrigin, sessionCookieAttributes } from "./security.js";

describe("security helpers", () => {
  test("websocket origin allows missing origin", () => {
    assert.equal(isAllowedWebSocketOrigin(undefined, "tycho.example.com"), true);
  });

  test("websocket origin allows same-origin https host", () => {
    assert.equal(isAllowedWebSocketOrigin("https://tycho.example.com", "tycho.example.com"), true);
  });

  test("websocket origin rejects cross-origin requests", () => {
    assert.equal(isAllowedWebSocketOrigin("https://evil.example.com", "tycho.example.com"), false);
  });

  test("websocket origin allows exact configured origins", () => {
    assert.equal(
      isAllowedWebSocketOrigin("https://admin.example.com", "tycho.example.com", "https://admin.example.com"),
      true
    );
  });

  test("websocket origin does not allow suffix matches", () => {
    assert.equal(
      isAllowedWebSocketOrigin("https://evil-tycho.example.com", "tycho.example.com", "https://tycho.example.com"),
      false
    );
  });

  test("production session cookies are secure and strict", () => {
    assert.deepEqual(sessionCookieAttributes("production"), ["HttpOnly", "SameSite=Strict", "Secure"]);
  });

  test("development session cookies stay local-http friendly", () => {
    assert.deepEqual(sessionCookieAttributes("development"), ["HttpOnly", "SameSite=Lax"]);
  });
});
