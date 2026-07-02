import type { Terminal } from "@xterm/xterm";

export type AgentConfig = { id: string; name: string; command: string; args?: string; cwd: string };
export type ProjectConfig = { id: string; name: string; path: string; description?: string; managed?: boolean };
export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled" | "deleted";
export type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  projectIds: string[];
};
export type PublicRuntimeConfig = { agents: AgentConfig[]; projects: ProjectConfig[]; defaultProjectId: string; webPort: number };
export type AgentEntry = AgentConfig & { autostart: boolean; restart_on_exit: boolean; env?: Record<string, string> };
export type TuimuxPane = { paneId: string; entry: AgentEntry; status: "running" | "stopped" | "error"; buffer: string; runId?: number };
export type TuimuxWindow = { id: string; title: string; layout: unknown; activePaneId: string };
export type TuimuxState = {
  connected: boolean;
  serverVersion?: string;
  windows: TuimuxWindow[];
  panes: TuimuxPane[];
  activeWindowId: string | null;
  activePaneId: string | null;
};
export type TerminalEntry = { windowState: TuimuxWindow; pane: TuimuxPane };
export type TerminalRecord = {
  term: Terminal;
  host: HTMLElement;
  resizeObserver: ResizeObserver;
  inputDisposable: { dispose: () => void };
};
export type ServerMessage = { type?: unknown; config?: unknown; state?: unknown; paneId?: unknown; data?: unknown };
export type UserEditState = { role: UserRole; password: string; projectIds: string[]; message: string; tone: string };
