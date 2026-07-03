import express from "express";
import http, { type IncomingMessage } from "node:http";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  assignProjectsToUser,
  bootstrapAdminUser,
  changeOwnPassword,
  createSession,
  createUser,
  deleteSession,
  filterProjectsForUser,
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
  type PublicUser,
  type UserRole
} from "../runtime/auth.js";
import {
  addManagedProject,
  createSessionEntry,
  getAgent,
  getProject,
  getPublicRuntimeConfig,
  readRuntimeConfig,
  removeManagedProject,
  toPublicAgentEntry,
  toPublicTuimuxState,
  updateManagedProject,
  type RuntimeConfig
} from "../runtime/config.js";
import { listDirectories } from "../runtime/directory-browser.js";
import { isAllowedWebSocketOrigin, sessionCookieAttributes } from "../runtime/security.js";
import { clientDistDir, projectRoot } from "../shared/paths.js";
import { TuimuxClient, type TuimuxMessage, type TuimuxPane, type TuimuxWindow } from "../tuimux/client.js";
import { createShutdownController } from "./shutdown.js";

let runtime: RuntimeConfig = readRuntimeConfig();
const tuimux = new TuimuxClient();
const wsTokens = new WeakMap<WebSocket, string>();
const sessionMetadataByEntryId = new Map<string, SessionMetadata>();

await bootstrapAdminUser();
await tuimux.start();

const app = express();
app.use(express.json({ limit: "1mb" }));

const sessionCookieName = "tycho_session";
const sessionMaxAgeSeconds = 7 * 24 * 60 * 60;

function readCookie(request: IncomingMessage, name: string): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) {
    return undefined;
  }
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
  return undefined;
}

function sessionCookie(token: string): string {
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${sessionMaxAgeSeconds}`,
    ...sessionCookieAttributes()
  ].join("; ");
}

function clearSessionCookie(): string {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "Max-Age=0",
    ...sessionCookieAttributes()
  ].join("; ");
}

function loginThrottleKey(request: IncomingMessage, username: string): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0];
  const ip = forwardedIp?.trim() || request.socket.remoteAddress || "unknown";
  return `${username.trim().toLowerCase()}:${ip}`;
}

async function authenticateRequest(request: IncomingMessage): Promise<PublicUser | null> {
  return getSessionUser(readCookie(request, sessionCookieName));
}

async function requireAuth(request: IncomingMessage, response: express.Response): Promise<PublicUser | null> {
  const user = await authenticateRequest(request);
  if (!user) {
    response.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function requireAdmin(request: IncomingMessage, response: express.Response): Promise<PublicUser | null> {
  const user = await requireAuth(request, response);
  if (!user) {
    return null;
  }
  if (user.role !== "admin") {
    response.status(403).json({ error: "Admin access required" });
    return null;
  }
  return user;
}

function publicConfigForUser(user: PublicUser) {
  return getPublicRuntimeConfig(runtime, filterProjectsForUser(runtime.projects, user));
}

type AdminSessionSummary = {
  windowId: string;
  paneId: string;
  name: string;
  creator: string;
  creatorId: string | null;
  createdAt: string | null;
  agent: string;
  agentId: string | null;
  projectName: string;
  projectPath: string;
  status: TuimuxPane["status"];
};

type AdminSessionDetail = AdminSessionSummary & {
  buffer: string;
};

type SessionMetadata = {
  creator: string;
  creatorId: string;
  createdAt: string;
  agent: string;
  agentId: string;
  projectName: string;
  projectPath: string;
};

function recordSessionMetadata(entryId: string, metadata: SessionMetadata): void {
  sessionMetadataByEntryId.set(entryId, metadata);
}

function metadataForPane(pane: TuimuxPane): SessionMetadata | undefined {
  return sessionMetadataByEntryId.get(pane.entry.id);
}

function paneOwnerId(pane: { entry: { env?: Record<string, string>; sessionUserId?: string } }): string | undefined {
  const entryId = "id" in pane.entry && typeof pane.entry.id === "string" ? pane.entry.id : "";
  return (entryId ? sessionMetadataByEntryId.get(entryId)?.creatorId : undefined)
    || pane.entry.sessionUserId
    || pane.entry.env?.REMOTE_TUI_USER_ID;
}

function paneVisibleToUser(user: PublicUser, pane: { entry: { env?: Record<string, string>; sessionUserId?: string } }): boolean {
  const ownerId = paneOwnerId(pane);
  if (ownerId) {
    return ownerId === user.id;
  }
  return user.role === "admin";
}

function filterStateForUser(user: PublicUser) {
  const state = tuimux.getState();
  const panes = state.panes.filter((pane) => paneVisibleToUser(user, pane));
  const paneIds = new Set(panes.map((pane) => pane.paneId));
  const windows = state.windows.filter((window) => paneIds.has(window.activePaneId));
  const activeWindowId = windows.some((window) => window.id === state.activeWindowId) ? state.activeWindowId : null;
  const activePaneId = paneIds.has(state.activePaneId || "") ? state.activePaneId : null;
  return toPublicTuimuxState({
    ...state,
    windows,
    panes,
    activeWindowId,
    activePaneId
  });
}

function internalWindowVisibleToUser(user: PublicUser, windowId: string): boolean {
  const state = tuimux.getState();
  const visiblePaneIds = new Set(
    state.panes.filter((pane) => paneVisibleToUser(user, pane)).map((pane) => pane.paneId)
  );
  return state.windows.some((window) => window.id === windowId && visiblePaneIds.has(window.activePaneId));
}

function internalPaneVisibleById(user: PublicUser, paneId: string): boolean {
  const state = tuimux.getState();
  return state.panes.some((pane) => pane.paneId === paneId && paneVisibleToUser(user, pane));
}

async function userForSocket(socket: WebSocket): Promise<PublicUser | null> {
  return getSessionUser(wsTokens.get(socket));
}

function agentNameForPane(pane: TuimuxPane): string {
  const envAgentName = metadataForPane(pane)?.agent || pane.entry.sessionAgentName || pane.entry.env?.REMOTE_TUI_AGENT_NAME;
  if (envAgentName) {
    return envAgentName;
  }
  const matchingAgent = runtime.agents.find((agent) => agent.command === pane.entry.command || pane.entry.id.startsWith(`${agent.id}-`));
  return matchingAgent?.name || pane.entry.command;
}

function adminSessionSummary(window: TuimuxWindow, pane: TuimuxPane): AdminSessionSummary {
  const metadata = metadataForPane(pane);
  return {
    windowId: window.id,
    paneId: pane.paneId,
    name: window.title || pane.entry.name,
    creator: metadata?.creator || pane.entry.sessionUsername || pane.entry.env?.REMOTE_TUI_USERNAME || "Legacy session",
    creatorId: metadata?.creatorId || pane.entry.sessionUserId || pane.entry.env?.REMOTE_TUI_USER_ID || null,
    createdAt: metadata?.createdAt || pane.entry.sessionCreatedAt || pane.entry.env?.REMOTE_TUI_CREATED_AT || null,
    agent: agentNameForPane(pane),
    agentId: metadata?.agentId || pane.entry.sessionAgentId || pane.entry.env?.REMOTE_TUI_AGENT_ID || null,
    projectName: metadata?.projectName || pane.entry.projectName || pane.entry.env?.REMOTE_TUI_PROJECT_NAME || "",
    projectPath: metadata?.projectPath || pane.entry.projectPath || pane.entry.env?.REMOTE_TUI_PROJECT_PATH || pane.entry.cwd,
    status: pane.status
  };
}

function listAdminSessions(): AdminSessionDetail[] {
  const state = tuimux.getState();
  const panesById = new Map(state.panes.map((pane) => [pane.paneId, pane]));
  return state.windows.flatMap((window) => {
    const pane = panesById.get(window.activePaneId);
    return pane ? [{ ...adminSessionSummary(window, pane), buffer: pane.buffer }] : [];
  });
}

app.get("/api/auth/me", async (request, response) => {
  const user = await authenticateRequest(request);
  response.json({ user });
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const throttleKey = loginThrottleKey(request, username);
    const throttle = getLoginThrottle(throttleKey);
    if (throttle.blocked) {
      response.status(429).json({ error: "Too many failed login attempts. Try again later." });
      return;
    }
    const user = await loginUser(username, password);
    if (!user) {
      recordFailedLogin(throttleKey);
      response.status(401).json({ error: "Invalid username or password" });
      return;
    }
    resetLoginThrottle(throttleKey);
    const session = await createSession(user.id);
    response.setHeader("set-cookie", sessionCookie(session.token));
    response.json({ user });
  } catch {
    response.status(400).json({ error: "Invalid login request" });
  }
});

app.post("/api/auth/logout", async (request, response) => {
  await deleteSession(readCookie(request, sessionCookieName));
  response.setHeader("set-cookie", clearSessionCookie());
  response.json({ ok: true });
});

app.post("/api/auth/password", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  try {
    const currentPassword = typeof request.body?.currentPassword === "string" ? request.body.currentPassword : "";
    const newPassword = typeof request.body?.newPassword === "string" ? request.body.newPassword : "";
    await changeOwnPassword(user.id, currentPassword, newPassword);
    response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid password request";
    response.status(message === "Current password is incorrect" ? 401 : 400).json({ error: message });
  }
});

app.get("/api/config", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  response.json(publicConfigForUser(user));
});

app.get("/api/state", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  response.json(filterStateForUser(user));
});

app.get("/api/admin/sessions", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  response.json({ sessions: listAdminSessions().map(({ buffer: _buffer, ...session }) => session) });
});

app.get("/api/admin/sessions/:windowId", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  const session = listAdminSessions().find((candidate) => candidate.windowId === request.params.windowId);
  if (!session) {
    response.status(404).json({ error: "Session not found" });
    return;
  }
  response.json({ session });
});

app.delete("/api/admin/sessions/:windowId", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  const session = listAdminSessions().find((candidate) => candidate.windowId === request.params.windowId);
  if (!session) {
    response.status(404).json({ error: "Session not found" });
    return;
  }
  tuimux.closeWindow(request.params.windowId);
  response.status(202).json({ ok: true });
});

app.post("/api/sessions", async (request, response) => {
  try {
    const user = await requireAuth(request, response);
    if (!user) {
      return;
    }
    const agentId = String(request.body?.agentId || "codebuddy");
    const projectId = typeof request.body?.projectId === "string" ? request.body.projectId : undefined;
    const label = typeof request.body?.label === "string" ? request.body.label : undefined;
    const agent = getAgent(agentId, runtime);
    const project = getProject(projectId, runtime);
    if (!userCanAccessProject(user, project.id)) {
      response.status(403).json({ error: "Project access denied" });
      return;
    }
    const entry = createSessionEntry(agent, project, label, {
      REMOTE_TUI_USER_ID: user.id,
      REMOTE_TUI_USERNAME: user.username
    });
    recordSessionMetadata(entry.id, {
      creator: user.username,
      creatorId: user.id,
      createdAt: entry.sessionCreatedAt || new Date().toISOString(),
      agent: agent.name,
      agentId: agent.id,
      projectName: project.name,
      projectPath: project.path
    });
    tuimux.createWindow(entry);
    response.status(202).json({ entry: toPublicAgentEntry(entry), project });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid session request" });
  }
});

app.get("/api/directories", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }

  try {
    const path = typeof request.query.path === "string" ? request.query.path : undefined;
    response.json(await listDirectories(path));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("outside configured roots")) {
      response.status(403).json({ error: "Directory is not available" });
      return;
    }
    if (message.includes("not found")) {
      response.status(404).json({ error: "Directory is not available" });
      return;
    }
    if (message.includes("not a directory")) {
      response.status(400).json({ error: "Directory is not available" });
      return;
    }
    response.status(400).json({ error: "Directory is not available" });
  }
});

app.post("/api/projects", async (request, response) => {
  try {
    const user = await requireAdmin(request, response);
    if (!user) {
      return;
    }
    const name = typeof request.body?.name === "string" ? request.body.name : "";
    const path = typeof request.body?.path === "string" ? request.body.path : "";
    const description = typeof request.body?.description === "string" ? request.body.description : undefined;
    const project = await addManagedProject({ name, path, description });
    refreshRuntimeConfig();
    broadcastConfig();
    response.status(201).json({ project, config: publicConfigForUser(user) });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid project request" });
  }
});

app.delete("/api/projects/:projectId", async (request, response) => {
  try {
    const user = await requireAdmin(request, response);
    if (!user) {
      return;
    }
    const removed = await removeManagedProject(request.params.projectId);
    refreshRuntimeConfig();
    broadcastConfig();
    response.status(removed ? 202 : 404).json({ ok: removed, config: publicConfigForUser(user) });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid project request" });
  }
});

app.patch("/api/projects/:projectId", async (request, response) => {
  try {
    const user = await requireAdmin(request, response);
    if (!user) {
      return;
    }
    const project = await updateManagedProject(request.params.projectId, {
      ...(typeof request.body?.name === "string" ? { name: request.body.name } : {}),
      ...(typeof request.body?.path === "string" ? { path: request.body.path } : {}),
      ...(typeof request.body?.description === "string" ? { description: request.body.description } : {})
    });
    if (!project) {
      response.status(404).json({ error: "Managed project not found" });
      return;
    }
    refreshRuntimeConfig();
    broadcastConfig();
    response.json({ project, config: publicConfigForUser(user) });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid project request" });
  }
});

app.get("/api/users", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  response.json({ users: await listUsers() });
});

app.post("/api/users", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  try {
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const role = request.body?.role === "admin" ? "admin" : "user";
    const created = await createUser({ username, password, role });
    response.status(201).json({ user: created, users: await listUsers() });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid user request" });
  }
});

app.patch("/api/users/:userId", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  try {
    const userId = request.params.userId;
    if (typeof request.body?.password === "string" && request.body.password) {
      await updateUserPassword(userId, request.body.password);
    }
    if (request.body?.role === "admin" || request.body?.role === "user") {
      await updateUserRole(userId, request.body.role as UserRole);
    }
    if (request.body?.status === "active" || request.body?.status === "disabled") {
      await updateUserStatus(userId, request.body.status);
    }
    response.json({ users: await listUsers() });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid user request" });
  }
});

app.put("/api/users/:userId/projects", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  try {
    const projectIds = Array.isArray(request.body?.projectIds)
      ? request.body.projectIds.filter((projectId: unknown) => typeof projectId === "string")
      : [];
    await assignProjectsToUser(request.params.userId, projectIds);
    response.json({ users: await listUsers() });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid assignment request" });
  }
});

app.delete("/api/users/:userId", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }
  const deleted = await softDeleteUser(request.params.userId);
  response.status(deleted ? 202 : 404).json({ ok: deleted, users: await listUsers() });
});

app.delete("/api/windows/:windowId", async (request, response) => {
  const user = await requireAuth(request, response);
  if (!user) {
    return;
  }
  if (!internalWindowVisibleToUser(user, request.params.windowId)) {
    response.status(403).json({ error: "Window access denied" });
    return;
  }
  tuimux.closeWindow(request.params.windowId);
  response.status(202).json({ ok: true });
});

if (process.env.NODE_ENV === "development") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: join(projectRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(clientDistDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(join(clientDistDir, "index.html"));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function refreshRuntimeConfig(): RuntimeConfig {
  runtime = readRuntimeConfig();
  return runtime;
}

function broadcastConfig(): void {
  for (const client of wss.clients) {
    void userForSocket(client).then((user) => {
      if (user) {
        send(client, { type: "config", config: publicConfigForUser(user) });
      }
    });
  }
}

wss.on("connection", async (socket, request) => {
  if (!isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)) {
    send(socket, { type: "error", message: "Origin not allowed" });
    socket.close(1008, "Origin not allowed");
    return;
  }
  const token = readCookie(request, sessionCookieName);
  const user = await getSessionUser(token);
  if (!token || !user) {
    send(socket, { type: "error", message: "Authentication required" });
    socket.close(1008, "Authentication required");
    return;
  }
  wsTokens.set(socket, token);
  send(socket, { type: "config", config: publicConfigForUser(user) });
  send(socket, { type: "state", state: filterStateForUser(user) });

  socket.on("message", async (raw) => {
    try {
      const socketUser = await userForSocket(socket);
      if (!socketUser) {
        send(socket, { type: "error", message: "Authentication required" });
        socket.close(1008, "Authentication required");
        return;
      }
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      switch (message.type) {
        case "create_session": {
          const agentId = String(message.agentId || "codebuddy");
          const projectId = typeof message.projectId === "string" ? message.projectId : undefined;
          const label = typeof message.label === "string" ? message.label : undefined;
          const project = getProject(projectId, runtime);
          if (!userCanAccessProject(socketUser, project.id)) {
            send(socket, { type: "error", message: "Project access denied" });
            break;
          }
          const agent = getAgent(agentId, runtime);
          const entry = createSessionEntry(agent, project, label, {
            REMOTE_TUI_USER_ID: socketUser.id,
            REMOTE_TUI_USERNAME: socketUser.username
          });
          recordSessionMetadata(entry.id, {
            creator: socketUser.username,
            creatorId: socketUser.id,
            createdAt: entry.sessionCreatedAt || new Date().toISOString(),
            agent: agent.name,
            agentId: agent.id,
            projectName: project.name,
            projectPath: project.path
          });
          tuimux.createWindow(entry);
          send(socket, { type: "session_requested", entry: toPublicAgentEntry(entry), project });
          break;
        }
        case "input":
          if (!internalPaneVisibleById(socketUser, String(message.paneId))) {
            send(socket, { type: "error", message: "Pane access denied" });
            break;
          }
          tuimux.input(String(message.paneId), String(message.data ?? ""));
          break;
        case "resize":
          if (!internalPaneVisibleById(socketUser, String(message.paneId))) {
            send(socket, { type: "error", message: "Pane access denied" });
            break;
          }
          tuimux.resizePane(String(message.paneId), Number(message.cols || 80), Number(message.rows || 24));
          break;
        case "close_window":
          if (!internalWindowVisibleToUser(socketUser, String(message.windowId))) {
            send(socket, { type: "error", message: "Window access denied" });
            break;
          }
          tuimux.closeWindow(String(message.windowId));
          break;
        case "focus_window":
          if (typeof message.windowId === "string" && !internalWindowVisibleToUser(socketUser, message.windowId)) {
            send(socket, { type: "error", message: "Window access denied" });
            break;
          }
          tuimux.setActiveWindow(typeof message.windowId === "string" ? message.windowId : null);
          break;
        default:
          send(socket, { type: "error", message: `Unknown message type: ${String(message.type)}` });
          break;
      }
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Invalid websocket message" });
    }
  });
});

tuimux.on("state", (state) => {
  for (const client of wss.clients) {
    void userForSocket(client).then((user) => {
      if (user) {
        send(client, { type: "state", state: filterStateForUser(user) });
      }
    });
  }
});

tuimux.on("message", (message: TuimuxMessage) => {
  if (message.type === "pane_output") {
    for (const client of wss.clients) {
      void userForSocket(client).then((user) => {
        if (user && internalPaneVisibleById(user, message.paneId)) {
          send(client, { type: "pane_output", paneId: message.paneId, data: message.data });
        }
      });
    }
  }
});

server.listen(runtime.webPort, () => {
  console.log(`Tycho: http://localhost:${runtime.webPort}`);
});

const shutdownController = createShutdownController({ server, wss, tuimux });
process.on("SIGINT", () => void shutdownController.shutdown(0));
process.on("SIGTERM", () => void shutdownController.shutdown(0));
