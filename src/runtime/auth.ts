import { mkdirSync } from "node:fs";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { projectsDbPath } from "../shared/paths.js";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 7;

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled" | "deleted";

export type User = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  projectIds: string[];
};

export type PublicUser = Omit<User, "passwordHash">;

export type CreateUserInput = {
  username: string;
  password: string;
  role: UserRole;
};

export type SessionToken = {
  token: string;
  expiresAt: string;
};

function getDbPath(): string {
  return resolve(process.env.PROJECTS_DB || projectsDbPath);
}

function openAuthDb(): DatabaseSync {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_assignments (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, project_id)
    );
  `);
  return db;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Username is required");
  }
  return normalized;
}

function assertPassword(password: string): void {
  if (!password) {
    throw new Error("Password is required");
  }
}

function assertRole(role: UserRole): void {
  if (role !== "admin" && role !== "user") {
    throw new Error("Invalid user role");
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rowToUser(row: Record<string, unknown>, projectIds: string[]): User {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    status: row.status as UserStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
    projectIds
  };
}

function getProjectIds(db: DatabaseSync, userId: string): string[] {
  const rows = db.prepare(`
    SELECT project_id
    FROM project_assignments
    WHERE user_id = ?
    ORDER BY project_id ASC
  `).all(userId) as Array<{ project_id: string }>;
  return rows.map((row) => row.project_id);
}

function getUserById(db: DatabaseSync, userId: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  return row ? rowToUser(row, getProjectIds(db, userId)) : null;
}

function getUserByUsername(db: DatabaseSync, username: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Record<string, unknown> | undefined;
  return row ? rowToUser(row, getProjectIds(db, String(row.id))) : null;
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = passwordHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function bootstrapAdminUser(): Promise<User> {
  const db = openAuthDb();
  try {
    const existingCount = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    if (existingCount.count > 0) {
      const username = normalizeUsername(process.env.TYCHO_ADMIN_USERNAME || "admin");
      const existingAdmin = getUserByUsername(db, username);
      if (existingAdmin) {
        return existingAdmin;
      }
      const firstAdmin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as Record<string, unknown> | undefined;
      if (firstAdmin) {
        return rowToUser(firstAdmin, getProjectIds(db, String(firstAdmin.id)));
      }
      throw new Error("No administrator user exists");
    }

    const id = randomUUID();
    const username = normalizeUsername(process.env.TYCHO_ADMIN_USERNAME || "admin");
    const password = process.env.TYCHO_ADMIN_PASSWORD || "admin";
    const passwordHash = await hashPassword(password);
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?)
    `).run(id, username, passwordHash, timestamp, timestamp);
    return getUserById(db, id)!;
  } finally {
    db.close();
  }
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const username = normalizeUsername(input.username);
  assertPassword(input.password);
  assertRole(input.role);
  const db = openAuthDb();
  try {
    if (getUserByUsername(db, username)) {
      throw new Error(`User already exists: ${username}`);
    }
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(id, username, passwordHash, input.role, timestamp, timestamp);
    return toPublicUser(getUserById(db, id)!);
  } finally {
    db.close();
  }
}

export async function listUsers(options: { includeDeleted?: boolean } = {}): Promise<PublicUser[]> {
  const db = openAuthDb();
  try {
    const rows = db.prepare(`
      SELECT *
      FROM users
      ${options.includeDeleted ? "" : "WHERE status != 'deleted'"}
      ORDER BY username COLLATE NOCASE ASC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => toPublicUser(rowToUser(row, getProjectIds(db, String(row.id)))));
  } finally {
    db.close();
  }
}

export async function loginUser(usernameInput: string, password: string): Promise<PublicUser | null> {
  const username = normalizeUsername(usernameInput);
  const db = openAuthDb();
  try {
    const user = getUserByUsername(db, username);
    if (!user || user.status !== "active") {
      return null;
    }
    if (!await verifyPassword(password, user.passwordHash)) {
      return null;
    }
    return toPublicUser(user);
  } finally {
    db.close();
  }
}

export async function createSession(userId: string): Promise<SessionToken> {
  const db = openAuthDb();
  try {
    const user = getUserById(db, userId);
    if (!user || user.status !== "active") {
      throw new Error("User is not active");
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const timestamp = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), userId, tokenHash, expiresAt, timestamp);
    return { token, expiresAt };
  } finally {
    db.close();
  }
}

export async function getSessionUser(token: string | undefined): Promise<PublicUser | null> {
  if (!token) {
    return null;
  }
  const db = openAuthDb();
  try {
    const row = db.prepare(`
      SELECT users.*
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), nowIso()) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const user = rowToUser(row, getProjectIds(db, String(row.id)));
    return user.status === "active" ? toPublicUser(user) : null;
  } finally {
    db.close();
  }
}

export async function deleteSession(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  const db = openAuthDb();
  try {
    const result = db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export async function updateUserPassword(userId: string, password: string): Promise<PublicUser> {
  const passwordHash = await hashPassword(password);
  const db = openAuthDb();
  try {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND status != 'deleted'")
      .run(passwordHash, nowIso(), userId);
    const user = getUserById(db, userId);
    if (!user || user.status === "deleted") {
      throw new Error(`Unknown user: ${userId}`);
    }
    return toPublicUser(user);
  } finally {
    db.close();
  }
}

export async function updateUserRole(userId: string, role: UserRole): Promise<PublicUser> {
  assertRole(role);
  const db = openAuthDb();
  try {
    db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND status != 'deleted'")
      .run(role, nowIso(), userId);
    const user = getUserById(db, userId);
    if (!user || user.status === "deleted") {
      throw new Error(`Unknown user: ${userId}`);
    }
    return toPublicUser(user);
  } finally {
    db.close();
  }
}

export async function updateUserStatus(userId: string, status: "active" | "disabled"): Promise<PublicUser> {
  const db = openAuthDb();
  try {
    db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'")
      .run(status, nowIso(), userId);
    if (status === "disabled") {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    }
    const user = getUserById(db, userId);
    if (!user || user.status === "deleted") {
      throw new Error(`Unknown user: ${userId}`);
    }
    return toPublicUser(user);
  } finally {
    db.close();
  }
}

export async function softDeleteUser(userId: string): Promise<boolean> {
  const db = openAuthDb();
  try {
    const timestamp = nowIso();
    const result = db.prepare(`
      UPDATE users
      SET status = 'deleted', deleted_at = ?, updated_at = ?
      WHERE id = ? AND status != 'deleted'
    `).run(timestamp, timestamp, userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM project_assignments WHERE user_id = ?").run(userId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export async function assignProjectsToUser(userId: string, projectIds: string[]): Promise<PublicUser> {
  const uniqueProjectIds = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))].sort();
  const db = openAuthDb();
  try {
    const user = getUserById(db, userId);
    if (!user || user.status === "deleted") {
      throw new Error(`Unknown user: ${userId}`);
    }
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM project_assignments WHERE user_id = ?").run(userId);
      const insert = db.prepare("INSERT INTO project_assignments (user_id, project_id, created_at) VALUES (?, ?, ?)");
      const timestamp = nowIso();
      for (const projectId of uniqueProjectIds) {
        insert.run(userId, projectId, timestamp);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return toPublicUser(getUserById(db, userId)!);
  } finally {
    db.close();
  }
}

export function userCanAccessProject(user: PublicUser, projectId: string): boolean {
  return user.role === "admin" || user.projectIds.includes(projectId);
}

export function filterProjectsForUser<T extends { id: string }>(projects: T[], user: PublicUser): T[] {
  if (user.role === "admin") {
    return projects;
  }
  return projects.filter((project) => user.projectIds.includes(project.id));
}
