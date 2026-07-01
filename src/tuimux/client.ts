import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import {
  projectRoot,
  tuimuxBinPath,
  tuimuxSocketPath,
  xdgConfigHome,
  xdgStateHome
} from "../shared/paths.js";
import { writeTuimuxConfig, type AgentEntry } from "../runtime/config.js";

export type TuimuxMessage =
  | { type: "snapshot"; layout: "panes"; windows?: TuimuxWindow[]; panes?: TuimuxPane[]; activeWindowId?: string | null; activePaneId?: string | null; serverVersion?: string }
  | { type: "pane_started"; pane: TuimuxPane }
  | { type: "pane_stopped"; paneId: string }
  | { type: "pane_status"; paneId: string; status: TuimuxPane["status"] }
  | { type: "pane_output"; paneId: string; data: string }
  | { type: "window_changed"; window: TuimuxWindow }
  | { type: "window_closed"; windowId: string }
  | { type: "active_window"; id: string | null }
  | { type: "active_pane"; id: string | null }
  | { type: "error"; message: string }
  | Record<string, unknown>;

export type TuimuxPane = {
  paneId: string;
  entry: AgentEntry;
  status: "running" | "stopped" | "error";
  buffer: string;
  runId?: number;
};

export type TuimuxWindow = {
  id: string;
  title: string;
  layout: unknown;
  activePaneId: string;
};

export type TuimuxState = {
  connected: boolean;
  serverVersion?: string;
  windows: TuimuxWindow[];
  panes: TuimuxPane[];
  activeWindowId: string | null;
  activePaneId: string | null;
};

export class TuimuxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private serverProcess: ChildProcess | null = null;
  private reconnecting = false;
  private state: TuimuxState = {
    connected: false,
    windows: [],
    panes: [],
    activeWindowId: null,
    activePaneId: null
  };

  getState(): TuimuxState {
    return {
      ...this.state,
      windows: [...this.state.windows],
      panes: [...this.state.panes]
    };
  }

  async start(): Promise<void> {
    await writeTuimuxConfig();
    await this.connectOrSpawn();
  }

  createWindow(entry: AgentEntry): void {
    this.send({ type: "create_window", entry });
  }

  closeWindow(windowId: string): void {
    this.send({ type: "close_window", windowId });
  }

  closePane(paneId: string): void {
    this.send({ type: "close_pane", paneId });
  }

  input(paneId: string, data: string): void {
    this.send({ type: "input", id: paneId, data });
  }

  resizePane(paneId: string, cols: number, rows: number): void {
    this.send({ type: "resize_pane", paneId, cols, rows });
  }

  setActiveWindow(windowId: string | null): void {
    this.send({ type: "set_active_window", id: windowId });
  }

  async shutdown(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      this.send({ type: "shutdown", clearSession: false });
      this.socket.end();
    }
  }

  private async connectOrSpawn(): Promise<void> {
    try {
      await this.connect();
      return;
    } catch (error) {
      await this.clearStaleSocket(error);
      this.spawnServer();
      await this.waitForServer();
    }
  }

  private async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(tuimuxSocketPath, () => {
        this.bindSocket(socket);
        resolve();
      });
      socket.once("error", (error) => {
        socket.destroy();
        reject(error);
      });
    });
  }

  private async waitForServer(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        await this.connect();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Timed out waiting for tuimux");
  }

  private spawnServer(): void {
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_STATE_HOME: xdgStateHome
    };

    this.serverProcess = spawn("bun", [tuimuxBinPath, "--server", "--layout", "panes", "--no-default-window", "--no-autostart"], {
      cwd: projectRoot,
      detached: true,
      env,
      stdio: "ignore"
    });

    this.serverProcess.unref();
  }

  private bindSocket(socket: net.Socket): void {
    this.socket = socket;
    this.buffer = "";
    socket.setEncoding("utf8");
    this.state.connected = true;
    this.emitState();

    socket.on("data", (chunk) => this.handleChunk(chunk.toString()));
    socket.on("close", () => this.handleDisconnect());
    socket.on("error", () => this.handleDisconnect());
  }

  private handleDisconnect(): void {
    if (this.reconnecting) {
      return;
    }
    this.state.connected = false;
    this.emitState();
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf("\n");
      if (!line) {
        continue;
      }
      const message = JSON.parse(line) as TuimuxMessage;
      this.applyMessage(message);
      this.emit("message", message);
    }
  }

  private applyMessage(message: TuimuxMessage): void {
    switch (message.type) {
      case "snapshot":
        this.state = {
          connected: true,
          serverVersion: message.serverVersion,
          windows: message.windows ?? [],
          panes: message.panes ?? [],
          activeWindowId: message.activeWindowId ?? null,
          activePaneId: message.activePaneId ?? null
        };
        this.emitState();
        break;
      case "pane_started":
        this.upsertPane(message.pane);
        break;
      case "pane_stopped":
        this.state.panes = this.state.panes.filter((pane) => pane.paneId !== message.paneId);
        this.emitState();
        break;
      case "pane_status":
        this.state.panes = this.state.panes.map((pane) =>
          pane.paneId === message.paneId ? { ...pane, status: message.status } : pane
        );
        this.emitState();
        break;
      case "pane_output":
        this.state.panes = this.state.panes.map((pane) =>
          pane.paneId === message.paneId ? { ...pane, buffer: (pane.buffer + message.data).slice(-100_000) } : pane
        );
        break;
      case "window_changed":
        this.state.windows = [
          ...this.state.windows.filter((window) => window.id !== message.window.id),
          message.window
        ];
        this.emitState();
        break;
      case "window_closed":
        this.state.windows = this.state.windows.filter((window) => window.id !== message.windowId);
        this.emitState();
        break;
      case "active_window":
        this.state.activeWindowId = message.id;
        this.emitState();
        break;
      case "active_pane":
        this.state.activePaneId = message.id;
        this.emitState();
        break;
      default:
        break;
    }
  }

  private upsertPane(nextPane: TuimuxPane): void {
    this.state.panes = [
      ...this.state.panes.filter((pane) => pane.paneId !== nextPane.paneId),
      nextPane
    ];
    this.emitState();
  }

  private emitState(): void {
    this.emit("state", this.getState());
  }

  private send(message: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("tuimux socket is not connected");
    }
    this.socket.write(`${JSON.stringify(message)}\n`);
  }

  private async clearStaleSocket(error: unknown): Promise<void> {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ECONNREFUSED" && code !== "ENOENT") {
      return;
    }
    if (!existsSync(tuimuxSocketPath)) {
      return;
    }
    await unlink(tuimuxSocketPath);
  }
}
