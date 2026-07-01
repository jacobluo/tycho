import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  assignProjectsToUser,
  bootstrapAdminUser,
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  listUsers,
  loginUser,
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
    const user = await createUser({ username: "alice", password: "secret", role: "user" });

    assert.equal(user.username, "alice");
    assert.equal(user.role, "user");
    assert.equal(user.status, "active");
    assert.equal(userCanAccessProject(user, "alpha"), false);

    await assignProjectsToUser(user.id, ["alpha", "beta"]);

    const refreshed = (await listUsers()).find((candidate) => candidate.id === user.id);
    assert.deepEqual(refreshed?.projectIds, ["alpha", "beta"]);
    assert.equal(userCanAccessProject(refreshed!, "alpha"), true);
  });

  test("updates password role and status", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "bob", password: "old", role: "user" });

    await updateUserPassword(user.id, "new");
    await updateUserRole(user.id, "admin");
    await updateUserStatus(user.id, "disabled");

    assert.equal(await loginUser("bob", "old"), null);
    assert.equal(await loginUser("bob", "new"), null);

    const updated = (await listUsers()).find((candidate) => candidate.id === user.id);
    assert.equal(updated?.role, "admin");
    assert.equal(updated?.status, "disabled");
  });

  test("soft deletes users and prevents username reuse", async () => {
    await bootstrapAdminUser();
    const user = await createUser({ username: "carol", password: "secret", role: "user" });
    const session = await createSession(user.id);
    await assignProjectsToUser(user.id, ["alpha"]);

    assert.equal(await softDeleteUser(user.id), true);
    assert.equal(await loginUser("carol", "secret"), null);
    assert.equal(await getSessionUser(session.token), null);

    const deleted = (await listUsers({ includeDeleted: true })).find((candidate) => candidate.id === user.id);
    assert.equal(deleted?.status, "deleted");
    assert.deepEqual(deleted?.projectIds, []);
    await assert.rejects(() => createUser({ username: "carol", password: "other", role: "user" }), /already exists/);
  });
});
