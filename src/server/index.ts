import express from "express";
import http, { type IncomingMessage } from "node:http";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  assignProjectsToUser,
  bootstrapAdminUser,
  createSession,
  createUser,
  deleteSession,
  filterProjectsForUser,
  getSessionUser,
  listUsers,
  loginUser,
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
  type RuntimeConfig
} from "../runtime/config.js";
import { clientDistDir, projectRoot } from "../shared/paths.js";
import { TuimuxClient, type TuimuxMessage } from "../tuimux/client.js";

let runtime: RuntimeConfig = readRuntimeConfig();
const tuimux = new TuimuxClient();
const wsTokens = new WeakMap<WebSocket, string>();

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
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`;
}

function clearSessionCookie(): string {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
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

function paneVisibleToUser(user: PublicUser, pane: { entry: { env?: Record<string, string> } }): boolean {
  return user.role === "admin" || pane.entry.env?.REMOTE_TUI_USER_ID === user.id;
}

function filterStateForUser(user: PublicUser) {
  const state = tuimux.getState();
  if (user.role === "admin") {
    return state;
  }
  const panes = state.panes.filter((pane) => paneVisibleToUser(user, pane));
  const paneIds = new Set(panes.map((pane) => pane.paneId));
  const windows = state.windows.filter((window) => paneIds.has(window.activePaneId));
  const activeWindowId = windows.some((window) => window.id === state.activeWindowId) ? state.activeWindowId : null;
  const activePaneId = paneIds.has(state.activePaneId || "") ? state.activePaneId : null;
  return {
    ...state,
    windows,
    panes,
    activeWindowId,
    activePaneId
  };
}

function windowVisibleToUser(user: PublicUser, windowId: string): boolean {
  const state = filterStateForUser(user);
  return state.windows.some((window) => window.id === windowId);
}

function paneVisibleById(user: PublicUser, paneId: string): boolean {
  const state = filterStateForUser(user);
  return state.panes.some((pane) => pane.paneId === paneId);
}

async function userForSocket(socket: WebSocket): Promise<PublicUser | null> {
  return getSessionUser(wsTokens.get(socket));
}

app.get("/api/auth/me", async (request, response) => {
  const user = await authenticateRequest(request);
  response.json({ user });
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const user = await loginUser(username, password);
    if (!user) {
      response.status(401).json({ error: "Invalid username or password" });
      return;
    }
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
    tuimux.createWindow(entry);
    response.status(202).json({ entry, project });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid session request" });
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
  if (!windowVisibleToUser(user, request.params.windowId)) {
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
          const entry = createSessionEntry(getAgent(agentId, runtime), project, label, {
            REMOTE_TUI_USER_ID: socketUser.id,
            REMOTE_TUI_USERNAME: socketUser.username
          });
          tuimux.createWindow(entry);
          send(socket, { type: "session_requested", entry, project });
          break;
        }
        case "input":
          if (!paneVisibleById(socketUser, String(message.paneId))) {
            send(socket, { type: "error", message: "Pane access denied" });
            break;
          }
          tuimux.input(String(message.paneId), String(message.data ?? ""));
          break;
        case "resize":
          if (!paneVisibleById(socketUser, String(message.paneId))) {
            send(socket, { type: "error", message: "Pane access denied" });
            break;
          }
          tuimux.resizePane(String(message.paneId), Number(message.cols || 80), Number(message.rows || 24));
          break;
        case "close_window":
          if (!windowVisibleToUser(socketUser, String(message.windowId))) {
            send(socket, { type: "error", message: "Window access denied" });
            break;
          }
          tuimux.closeWindow(String(message.windowId));
          break;
        case "focus_window":
          if (typeof message.windowId === "string" && !windowVisibleToUser(socketUser, message.windowId)) {
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
        if (user && paneVisibleById(user, message.paneId)) {
          send(client, { type: "pane_output", paneId: message.paneId, data: message.data });
        }
      });
    }
  }
});

server.listen(runtime.webPort, () => {
  console.log(`Tycho: http://localhost:${runtime.webPort}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
