<template>
  <main class="app-shell">
    <aside class="sidebar">
      <div>
        <h1>Tycho</h1>
        <p id="connectionStatus" class="status" :class="{ connected: state.connected }">
          {{ state.connected ? "Connected" : connectionLabel }}
        </p>
      </div>

      <div class="projects">
        <h2>Project</h2>
        <label class="project-select-wrap">
          <select id="projectSelect" v-model="selectedProjectId" class="project-select" @change="persistSelectedProject">
            <option v-for="project in config.projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
        </label>
        <p id="projectPath" class="project-path">{{ selectedProject?.path || "No project configured" }}</p>
        <p id="projectDescription" class="project-description">{{ selectedProject?.description || "" }}</p>
        <button
          id="deleteProject"
          class="secondary-button"
          type="button"
          :disabled="!selectedProject?.managed || projectDeleteBusy"
          @click="deleteSelectedProject"
        >
          Delete Project
        </button>
      </div>

      <div class="project-manager">
        <h2>Add Project</h2>
        <form id="projectForm" class="project-form" @submit.prevent="submitProjectForm">
          <label>
            <span>Name</span>
            <input v-model="projectForm.name" name="name" type="text" autocomplete="off" required />
          </label>
          <label>
            <span>Local Path</span>
            <input v-model="projectForm.path" name="path" type="text" autocomplete="off" required />
          </label>
          <label>
            <span>Description</span>
            <textarea v-model="projectForm.description" name="description" rows="3"></textarea>
          </label>
          <button type="submit" :disabled="projectFormBusy">Add Project</button>
          <p id="projectFormStatus" class="form-status" :class="projectFormTone">{{ projectFormStatus }}</p>
        </form>
      </div>

      <div class="launcher">
        <h2>Agents</h2>
        <div id="agentButtons" class="agent-buttons">
          <button
            v-for="agent in config.agents"
            :key="agent.id"
            class="agent-button"
            type="button"
            :disabled="!selectedProjectId"
            @click="createSession(agent.id)"
          >
            <span>{{ agent.name }}</span>
            <span>{{ agent.command }}</span>
          </button>
        </div>
      </div>

      <div class="sessions">
        <h2>Sessions</h2>
        <div id="sessionList" class="session-list">
          <div v-if="state.windows.length === 0" class="session-item">
            <span>No sessions</span>
          </div>
          <div
            v-for="windowState in state.windows"
            v-else
            :key="windowState.id"
            class="session-item"
            @click="focusWindow(windowState.id)"
          >
            <strong>{{ windowState.title }}</strong>
            <span>{{ paneForWindow(windowState)?.status || "starting" }}</span>
            <small>{{ paneForWindow(windowState)?.entry.cwd || "" }}</small>
          </div>
        </div>
      </div>
    </aside>

    <section class="workspace">
      <header class="workspace-header">
        <div>
          <h2>Server-side TUIs</h2>
          <p>CodeBuddy / Codex / Claude run inside tuimux on the server.</p>
        </div>
        <button id="newCodeBuddy" type="button" @click="createSession('codebuddy')">New CodeBuddy</button>
      </header>

      <div id="terminalGrid" class="terminal-grid" :class="{ empty: terminalEntries.length === 0 }">
        <div v-if="terminalEntries.length === 0" class="empty-state">Start an agent to open a live TUI panel.</div>

        <article
          v-for="entry in terminalEntries"
          v-else
          :key="entry.windowState.id"
          class="terminal-card"
          :class="{ active: state.activeWindowId === entry.windowState.id || activePaneId === entry.pane.paneId }"
          :data-window-id="entry.windowState.id"
          :data-pane-id="entry.pane.paneId"
          @pointerdown="handleCardPointerDown($event, entry)"
        >
          <div class="terminal-titlebar">
            <div class="terminal-title">
              <strong>{{ entry.windowState.title }}</strong>
              <span>{{ entry.pane.status }} / {{ entry.pane.entry.cwd }}</span>
            </div>
            <div class="terminal-actions">
              <button type="button" @click="focusPane(entry)">Focus</button>
              <button class="danger" type="button" @click="closeWindow(entry.windowState.id)">Close</button>
            </div>
          </div>
          <div
            class="terminal-host"
            tabindex="0"
            :ref="(el) => setTerminalHost(entry, el)"
            @pointerdown="focusPane(entry)"
            @focus="focusPane(entry)"
          ></div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { Terminal } from "@xterm/xterm";

type AgentConfig = {
  id: string;
  name: string;
  command: string;
  args?: string;
  cwd: string;
};

type ProjectConfig = {
  id: string;
  name: string;
  path: string;
  description?: string;
  managed?: boolean;
};

type PublicRuntimeConfig = {
  agents: AgentConfig[];
  projects: ProjectConfig[];
  defaultProjectId: string;
  webPort: number;
};

type AgentEntry = AgentConfig & {
  autostart: boolean;
  restart_on_exit: boolean;
  env?: Record<string, string>;
};

type TuimuxPane = {
  paneId: string;
  entry: AgentEntry;
  status: "running" | "stopped" | "error";
  buffer: string;
  runId?: number;
};

type TuimuxWindow = {
  id: string;
  title: string;
  layout: unknown;
  activePaneId: string;
};

type TuimuxState = {
  connected: boolean;
  serverVersion?: string;
  windows: TuimuxWindow[];
  panes: TuimuxPane[];
  activeWindowId: string | null;
  activePaneId: string | null;
};

type TerminalEntry = {
  windowState: TuimuxWindow;
  pane: TuimuxPane;
};

type TerminalRecord = {
  term: Terminal;
  host: HTMLElement;
  resizeObserver: ResizeObserver;
  inputDisposable: { dispose: () => void };
};

type ServerMessage =
  | { type?: unknown; config?: unknown; state?: unknown; paneId?: unknown; data?: unknown };

const config = reactive<PublicRuntimeConfig>({
  agents: [],
  projects: [],
  defaultProjectId: "",
  webPort: 0
});
const state = reactive<TuimuxState>({
  connected: false,
  windows: [],
  panes: [],
  activeWindowId: null,
  activePaneId: null
});
const projectForm = reactive({
  name: "",
  path: "",
  description: ""
});
const selectedProjectId = ref("");
const activePaneId = ref<string | null>(null);
const projectFormStatus = ref("");
const projectFormTone = ref("");
const projectFormBusy = ref(false);
const projectDeleteBusy = ref(false);
const socket = ref<WebSocket | null>(null);
const reconnectTimer = ref<number | null>(null);
const connectionLabel = ref("Connecting");
const terminals = new Map<string, TerminalRecord>();

const selectedProject = computed(() =>
  config.projects.find((project) => project.id === selectedProjectId.value) || config.projects[0]
);

const terminalEntries = computed<TerminalEntry[]>(() =>
  state.windows.flatMap((windowState) => {
    const pane = paneForWindow(windowState);
    return pane ? [{ windowState, pane }] : [];
  })
);

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const nextSocket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.value = nextSocket;

  nextSocket.addEventListener("open", () => {
    connectionLabel.value = "Connected";
    state.connected = true;
  });

  nextSocket.addEventListener("close", () => {
    state.connected = false;
    connectionLabel.value = "Disconnected, retrying";
    reconnectTimer.value = window.setTimeout(connect, 800);
  });

  nextSocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === "config") {
      applyConfig(message.config as PublicRuntimeConfig);
      return;
    }
    if (message.type === "state") {
      applyState(message.state as TuimuxState);
      return;
    }
    if (message.type === "pane_output" && typeof message.paneId === "string" && typeof message.data === "string") {
      terminals.get(message.paneId)?.term.write(message.data);
    }
  });
}

function send(payload: Record<string, unknown>): void {
  if (socket.value?.readyState === WebSocket.OPEN) {
    socket.value.send(JSON.stringify(payload));
  }
}

function applyConfig(nextConfig: PublicRuntimeConfig, preferredProjectId = selectedProjectId.value): void {
  config.agents = nextConfig.agents;
  config.projects = nextConfig.projects;
  config.defaultProjectId = nextConfig.defaultProjectId;
  config.webPort = nextConfig.webPort;
  selectedProjectId.value = getProjectId(preferredProjectId);
  persistSelectedProject();
}

function applyState(nextState: TuimuxState): void {
  state.connected = nextState.connected;
  state.serverVersion = nextState.serverVersion;
  state.windows = nextState.windows;
  state.panes = nextState.panes;
  state.activeWindowId = nextState.activeWindowId;
  state.activePaneId = nextState.activePaneId;
}

function getProjectId(preferredProjectId?: string): string {
  if (preferredProjectId && config.projects.some((project) => project.id === preferredProjectId)) {
    return preferredProjectId;
  }
  const stored = localStorage.getItem("tycho-project-id");
  if (stored && config.projects.some((project) => project.id === stored)) {
    return stored;
  }
  return config.defaultProjectId || config.projects[0]?.id || "";
}

function persistSelectedProject(): void {
  if (selectedProjectId.value) {
    localStorage.setItem("tycho-project-id", selectedProjectId.value);
  }
}

function createSession(agentId: string): void {
  send({ type: "create_session", agentId, projectId: selectedProjectId.value });
}

async function submitProjectForm(): Promise<void> {
  setProjectFormStatus("Adding project");
  projectFormBusy.value = true;

  try {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(projectForm)
    });
    const payload = await response.json() as { project?: ProjectConfig; config?: PublicRuntimeConfig; error?: string };
    if (!response.ok || !payload.project || !payload.config) {
      throw new Error(payload.error || "Could not add project");
    }
    projectForm.name = "";
    projectForm.path = "";
    projectForm.description = "";
    applyConfig(payload.config, payload.project.id);
    setProjectFormStatus("Project added", "success");
  } catch (error) {
    setProjectFormStatus(error instanceof Error ? error.message : "Could not add project", "error");
  } finally {
    projectFormBusy.value = false;
  }
}

async function deleteSelectedProject(): Promise<void> {
  if (!selectedProject.value?.managed) {
    return;
  }
  if (!confirm(`Delete project "${selectedProject.value.name}" from Tycho?`)) {
    return;
  }

  projectDeleteBusy.value = true;
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject.value.id)}`, {
      method: "DELETE"
    });
    const payload = await response.json() as { ok?: boolean; config?: PublicRuntimeConfig; error?: string };
    if (!response.ok || !payload.config) {
      throw new Error(payload.error || "Could not delete project");
    }
    applyConfig(payload.config);
    setProjectFormStatus("Project deleted", "success");
  } catch (error) {
    setProjectFormStatus(error instanceof Error ? error.message : "Could not delete project", "error");
  } finally {
    projectDeleteBusy.value = false;
  }
}

function setProjectFormStatus(message: string, tone = ""): void {
  projectFormStatus.value = message;
  projectFormTone.value = tone;
}

function paneForWindow(windowState: TuimuxWindow): TuimuxPane | undefined {
  return state.panes.find((pane) => pane.paneId === windowState.activePaneId);
}

function focusWindow(windowId: string): void {
  document.querySelector(`[data-window-id="${windowId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  send({ type: "focus_window", windowId });
}

function closeWindow(windowId: string): void {
  send({ type: "close_window", windowId });
}

function focusPane(entry: TerminalEntry): void {
  activePaneId.value = entry.pane.paneId;
  send({ type: "focus_window", windowId: entry.windowState.id });
  terminals.get(entry.pane.paneId)?.term.focus();
}

function handleCardPointerDown(event: PointerEvent, entry: TerminalEntry): void {
  if ((event.target as HTMLElement).closest(".terminal-actions")) {
    return;
  }
  focusPane(entry);
}

function setTerminalHost(entry: TerminalEntry, element: Element | ComponentPublicInstance | null): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const existing = terminals.get(entry.pane.paneId);
  if (existing?.host === element) {
    return;
  }
  if (existing) {
    disposeTerminal(entry.pane.paneId);
  }
  mountTerminal(entry, element);
}

function mountTerminal(entry: TerminalEntry, host: HTMLElement): void {
  const term = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.18,
    theme: {
      background: "#0b0f14",
      foreground: "#eef2f7",
      cursor: "#4fb8ff",
      selectionBackground: "#2f5d7c"
    }
  });

  term.open(host);
  term.write(entry.pane.buffer || "");
  const inputDisposable = term.onData((data) => send({ type: "input", paneId: entry.pane.paneId, data }));
  const resizeObserver = new ResizeObserver(() => resizeTerminal(entry.pane.paneId));
  resizeObserver.observe(host);
  terminals.set(entry.pane.paneId, { term, host, resizeObserver, inputDisposable });

  window.setTimeout(() => {
    resizeTerminal(entry.pane.paneId);
    focusPane(entry);
  }, 50);
}

function resizeTerminal(paneId: string): void {
  const record = terminals.get(paneId);
  if (!record) {
    return;
  }
  const rect = record.host.getBoundingClientRect();
  const cols = Math.max(20, Math.floor((rect.width - 16) / 7.8));
  const rows = Math.max(6, Math.floor((rect.height - 16) / 15.4));
  record.term.resize(cols, rows);
  send({ type: "resize", paneId, cols, rows });
}

function disposeTerminal(paneId: string): void {
  const record = terminals.get(paneId);
  if (!record) {
    return;
  }
  record.resizeObserver.disconnect();
  record.inputDisposable.dispose();
  record.term.dispose();
  terminals.delete(paneId);
}

watch(
  () => state.panes.map((pane) => pane.paneId),
  (paneIds) => {
    const livePaneIds = new Set(paneIds);
    for (const paneId of terminals.keys()) {
      if (!livePaneIds.has(paneId)) {
        disposeTerminal(paneId);
      }
    }
    void nextTick(() => {
      for (const paneId of paneIds) {
        resizeTerminal(paneId);
      }
    });
  }
);

onMounted(connect);

onUnmounted(() => {
  if (reconnectTimer.value) {
    window.clearTimeout(reconnectTimer.value);
  }
  socket.value?.close();
  for (const paneId of [...terminals.keys()]) {
    disposeTerminal(paneId);
  }
});
</script>
