import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  assignProjectsToUser,
  bootstrapAdminUser,
  changeOwnPassword,
  createSession,
  createUser,
  deleteSession,
  getLoginThrottle,
  getSessionUser,
  listUsers,
  loginUser,
  recordFailedLogin,
  resetLoginThrottle,
  softDeleteUser,
  updateUserPassword,
  updateUserRole,
  updateUserStatus,
  userCanAccessProject,
  verifyPassword
} from "./auth.js";

const ORIGINAL_ENV = { ...process.env };
const tempDirs: string[] = [];

function makeStore(): string {
  const dir = mkdtempSync(join(tmpdir(), "tycho-auth-"));
  tempDirs.push(dir);
  return join(dir, "tycho.sqlite");
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.PROJECTS_DB = makeStore();
  delete process.env.TYCHO_ADMIN_USERNAME;
  delete process.env.TYCHO_ADMIN_PASSWORD;
  delete process.env.NODE_ENV;
  delete process.env.TYCHO_ALLOW_DEFAULT_ADMIN_PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("auth runtime", () => {
  test("bootstraps the default admin user once", async () => {
    const first = await bootstrapAdminUser();
    const second = await bootstrapAdminUser();

    assert.equal(first.username, "admin");
    assert.equal(first.role, "admin");
    assert.equal(first.status, "active");
    assert.equal(second.id, first.id);
    assert.equal((await listUsers()).length, 1);
    assert.equal(await verifyPassword("admin", first.passwordHash), true);
  });

  test("production bootstrap requires an explicit admin password", async () => {
    process.env.NODE_ENV = "production";

    await assert.rejects(
      () => bootstrapAdminUser(),
      /TYCHO_ADMIN_PASSWORD is required/
    );
  });

  test("production bootstrap accepts an explicit strong admin password", async () => {
    process.env.NODE_ENV = "production";
    process.env.TYCHO_ADMIN_PASSWORD = "correct horse battery staple";

    const admin = await bootstrapAdminUser();

    assert.equal(admin.username, "admin");
    assert.equal(admin.role, "admin");
    assert.equal(await verifyPassword("correct horse battery staple", admin.passwordHash), true);
  });

  test("logs in active users and rejects bad credentials", async () => {
    await bootstrapAdminUser();

    const bad = await loginUser("admin", "wrong");
    const good = await loginUser("admin", "admin");

    assert.equal(bad, null);
    assert.equal(good?.username, "admin");
    assert.equal(good?.role, "admin");
  });

  test("creates sessions and resolves active session users", async () => {
    const admin = await bootstrapAdminUser();
    const session = await createSession(admin.id);

    const user = await getSessionUser(session.token);

    assert.equal(user?.id, admin.id);
    assert.equal(user?.username, "admin");
    assert.equal(await deleteSession(session.token), true);
    assert.equal(await getSessionUser(session.token), null);
  });

  test("creates users, assigns projects, and checks access", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "alice", password: "secret-secret", role: "user" });

    assert.equal(user.username, "alice");
    assert.equal(user.role, "user");
    assert.equal(user.status, "active");
    assert.equal(userCanAccessProject(user, "alpha"), false);

    await assignProjectsToUser(user.id, ["alpha", "beta"]);

    const refreshed = (await listUsers()).find((candidate) => candidate.id === user.id);
    assert.deepEqual(refreshed?.projectIds, ["alpha", "beta"]);
    assert.equal(userCanAccessProject(refreshed!, "alpha"), true);
  });

  test("password policy rejects short passwords for create update and own change", async () => {
    await bootstrapAdminUser();

    await assert.rejects(
      () => createUser({ username: "shorty", password: "short", role: "user" }),
      /Password must be at least 12 characters/
    );

    const user = await createUser({ username: "strong", password: "long-enough-password", role: "user" });

    await assert.rejects(
      () => updateUserPassword(user.id, "short"),
      /Password must be at least 12 characters/
    );
    await assert.rejects(
      () => changeOwnPassword(user.id, "long-enough-password", "short"),
      /Password must be at least 12 characters/
    );
  });

  test("login throttle blocks repeated failures and clears on success", async () => {
    resetLoginThrottle();
    const key = "alice:127.0.0.1";

    for (let index = 0; index < 5; index += 1) {
      recordFailedLogin(key);
    }

    assert.equal(getLoginThrottle(key).blocked, true);
    resetLoginThrottle(key);
    assert.equal(getLoginThrottle(key).blocked, false);
  });

  test("updates password role and status", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "bob", password: "old-password-123", role: "user" });

    await updateUserPassword(user.id, "new-password-123");
    await updateUserRole(user.id, "admin");
    await updateUserStatus(user.id, "disabled");

    assert.equal(await loginUser("bob", "old-password-123"), null);
    assert.equal(await loginUser("bob", "new-password-123"), null);

    const updated = (await listUsers()).find((candidate) => candidate.id === user.id);
    assert.equal(updated?.role, "admin");
    assert.equal(updated?.status, "disabled");
  });

  test("changes own password only when current password is correct", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "dana", password: "old-password-123", role: "user" });

    await assert.rejects(
      () => changeOwnPassword(user.id, "wrong-password", "new-password-123"),
      /Current password is incorrect/
    );
    assert.equal(await loginUser("dana", "old-password-123") !== null, true);
    assert.equal(await loginUser("dana", "new-password-123"), null);

    await changeOwnPassword(user.id, "old-password-123", "new-password-123");

    assert.equal(await loginUser("dana", "old-password-123"), null);
    assert.equal(await loginUser("dana", "new-password-123") !== null, true);
  });

  test("soft deletes users and prevents username reuse", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "carol", password: "secret-secret", role: "user" });
    const session = await createSession(user.id);
    await assignProjectsToUser(user.id, ["alpha"]);

    assert.equal(await softDeleteUser(user.id), true);
    assert.equal(await loginUser("carol", "secret-secret"), null);
    assert.equal(await getSessionUser(session.token), null);

    const deleted = (await listUsers({ includeDeleted: true })).find((candidate) => candidate.id === user.id);
    assert.equal(deleted?.status, "deleted");
    assert.deepEqual(deleted?.projectIds, []);
    await assert.rejects(
      () => createUser({ username: "carol", password: "other-password", role: "user" }),
      /already exists/
    );
  });
});
