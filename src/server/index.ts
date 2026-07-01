import express from "express";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { createSessionEntry, getAgent, getProject, getPublicRuntimeConfig, readRuntimeConfig } from "../runtime/config.js";
import { nodeModulesDir, publicDir } from "../shared/paths.js";
import { TuimuxClient, type TuimuxMessage } from "../tuimux/client.js";

const runtime = readRuntimeConfig();
const tuimux = new TuimuxClient();

await tuimux.start();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));
app.use("/vendor/xterm", express.static(`${nodeModulesDir}/@xterm/xterm`));

app.get("/api/config", (_request, response) => {
  response.json(getPublicRuntimeConfig(runtime));
});

app.get("/api/state", (_request, response) => {
  response.json(tuimux.getState());
});

app.post("/api/sessions", (request, response) => {
  try {
    const agentId = String(request.body?.agentId || "codebuddy");
    const projectId = typeof request.body?.projectId === "string" ? request.body.projectId : undefined;
    const label = typeof request.body?.label === "string" ? request.body.label : undefined;
    const agent = getAgent(agentId, runtime);
    const project = getProject(projectId, runtime);
    const entry = createSessionEntry(agent, project, label);
    tuimux.createWindow(entry);
    response.status(202).json({ entry, project });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid session request" });
  }
});

app.delete("/api/windows/:windowId", (request, response) => {
  tuimux.closeWindow(request.params.windowId);
  response.status(202).json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(payload: unknown): void {
  for (const client of wss.clients) {
    send(client, payload);
  }
}

wss.on("connection", (socket) => {
  send(socket, { type: "config", config: getPublicRuntimeConfig(runtime) });
  send(socket, { type: "state", state: tuimux.getState() });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      switch (message.type) {
        case "create_session": {
          const agentId = String(message.agentId || "codebuddy");
          const projectId = typeof message.projectId === "string" ? message.projectId : undefined;
          const label = typeof message.label === "string" ? message.label : undefined;
          const project = getProject(projectId, runtime);
          const entry = createSessionEntry(getAgent(agentId, runtime), project, label);
          tuimux.createWindow(entry);
          send(socket, { type: "session_requested", entry, project });
          break;
        }
        case "input":
          tuimux.input(String(message.paneId), String(message.data ?? ""));
          break;
        case "resize":
          tuimux.resizePane(String(message.paneId), Number(message.cols || 80), Number(message.rows || 24));
          break;
        case "close_window":
          tuimux.closeWindow(String(message.windowId));
          break;
        case "focus_window":
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
  broadcast({ type: "state", state });
});

tuimux.on("message", (message: TuimuxMessage) => {
  if (message.type === "pane_output") {
    broadcast({ type: "pane_output", paneId: message.paneId, data: message.data });
  }
});

server.listen(runtime.webPort, () => {
  console.log(`Tycho: http://localhost:${runtime.webPort}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
