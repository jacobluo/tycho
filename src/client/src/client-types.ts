import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

export type AgentConfig = { id: string; name: string; command: string; args?: string; cwd: string };
export type ProjectConfig = { id: string; name: string; path: string; description?: string; managed?: boolean };
export type DirectoryBrowserEntry = { name: string; path: string };
export type DirectoryBrowserResponse = {
  roots: DirectoryBrowserEntry[];
  currentPath: string | null;
  parentPath: string | null;
  entries: DirectoryBrowserEntry[];
};
export type ProjectFileEntry = {
  name: string;
  relativePath: string;
  type: "directory" | "file";
  size: number | null;
  modifiedAt: string | null;
  sensitive: boolean;
};
export type ProjectDirectoryListing = {
  projectId: string;
  projectName: string;
  currentPath: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};
export type ProjectFilePreview = {
  projectId: string;
  relativePath: string;
  name: string;
  size: number;
  modifiedAt: string | null;
  sensitive: boolean;
  previewable: boolean;
  truncated: boolean;
  content: string;
  reason?: "sensitive" | "directory" | "binary" | "too-large" | "not-found";
};
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
export type AdminSessionSummary = {
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
  status: "running" | "stopped" | "error";
};
export type AdminSessionDetail = AdminSessionSummary & {
  buffer: string;
};
export type AgentEntry = AgentConfig & {
  autostart: boolean;
  restart_on_exit: boolean;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  env?: Record<string, string>;
};
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
export type TerminalSlotEntry = {
  slotId: "slot-1" | "slot-2" | "slot-3" | "slot-4";
  label: string;
  windowState?: TuimuxWindow;
  pane?: TuimuxPane;
};
export type TerminalRecord = {
  term: Terminal;
  fitAddon: FitAddon;
  host: HTMLElement;
  resizeObserver: ResizeObserver;
  inputDisposable: { dispose: () => void };
  lastResize?: { cols: number; rows: number };
};
export type ServerMessage = { type?: unknown; config?: unknown; state?: unknown; paneId?: unknown; data?: unknown };
export type UserEditState = { role: UserRole; password: string; projectIds: string[]; message: string; tone: string };
