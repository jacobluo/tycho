<template>
  <main v-if="!currentUser" class="login-shell">
    <form class="login-panel" @submit.prevent="login">
      <h1>Tycho</h1>
      <p>Sign in to open server-side TUI sessions.</p>
      <label>
        <span>Username</span>
        <input v-model="loginForm.username" autocomplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input v-model="loginForm.password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit" :disabled="loginBusy">Log In</button>
      <p class="form-status error">{{ loginError }}</p>
    </form>
  </main>

  <main v-else class="app-shell">
    <aside class="sidebar">
      <div>
        <div class="brand-row">
          <h1>Tycho</h1>
        </div>
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
        <p id="projectPath" class="project-path">{{ selectedProject?.path || "No projects assigned" }}</p>
        <p id="projectDescription" class="project-description">{{ selectedProject?.description || "" }}</p>
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

    <section v-if="activeView === 'workspace'" class="workspace">
      <header class="workspace-header">
        <div>
          <h2>Server-side TUIs</h2>
          <p>CodeBuddy / Codex / Claude run inside tuimux on the server.</p>
        </div>
        <div class="header-actions">
          <button id="newCodeBuddy" type="button" :disabled="!selectedProjectId" @click="createSession('codebuddy')">New CodeBuddy</button>
          <div class="account-menu-wrap">
            <button class="account-menu-trigger" type="button" @click="toggleAccountMenu">
              {{ currentUser.username }} / {{ currentUser.role }}
            </button>
            <div v-if="accountMenuOpen" class="account-menu" role="menu">
              <button role="menuitem" type="button" @click="openPasswordDialog">Change Password</button>
              <button v-if="isAdmin" role="menuitem" type="button" @click="openManagementFromMenu">Admin Management</button>
              <button role="menuitem" type="button" @click="logout">Log Out</button>
            </div>
          </div>
        </div>
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

    <section v-else class="workspace management-shell">
      <header class="workspace-header management-header">
        <div>
          <h2>Admin Management</h2>
          <p>Manage project access and users without crowding the runtime workspace.</p>
        </div>
        <div class="header-actions">
          <button type="button" @click="showWorkspace">Back to Workspace</button>
          <div class="account-menu-wrap">
            <button class="account-menu-trigger" type="button" @click="toggleAccountMenu">
              {{ currentUser.username }} / {{ currentUser.role }}
            </button>
            <div v-if="accountMenuOpen" class="account-menu" role="menu">
              <button role="menuitem" type="button" @click="openPasswordDialog">Change Password</button>
              <button v-if="isAdmin" role="menuitem" type="button" @click="openManagementFromMenu">Admin Management</button>
              <button role="menuitem" type="button" @click="logout">Log Out</button>
            </div>
          </div>
        </div>
      </header>

      <div class="management-body">
        <div class="management-tabs" role="tablist" aria-label="Admin sections">
          <button
            role="tab"
            type="button"
            :aria-selected="adminTab === 'projects'"
            :class="{ active: adminTab === 'projects' }"
            @click="adminTab = 'projects'"
          >
            Project Management
          </button>
          <button
            role="tab"
            type="button"
            :aria-selected="adminTab === 'users'"
            :class="{ active: adminTab === 'users' }"
            @click="adminTab = 'users'"
          >
            User Management
          </button>
        </div>

        <div v-if="adminTab === 'projects'" class="management-panel" role="tabpanel">
          <div class="section-heading">
            <h2>Project Management</h2>
            <p>Add local projects to Tycho and remove managed entries when they are no longer needed.</p>
          </div>
          <div class="management-grid">
            <form id="projectForm" class="project-form admin-card" @submit.prevent="submitProjectForm">
              <h3>Add Project</h3>
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
                <textarea v-model="projectForm.description" name="description" rows="4"></textarea>
              </label>
              <button type="submit" :disabled="projectFormBusy">Add Project</button>
              <p id="projectFormStatus" class="form-status" :class="projectFormTone">{{ projectFormStatus }}</p>
            </form>

            <div class="admin-card project-detail-card">
              <h3>Selected Project</h3>
              <dl>
                <div>
                  <dt>Name</dt>
                  <dd>{{ selectedProject?.name || "No project" }}</dd>
                </div>
                <div>
                  <dt>Path</dt>
                  <dd>{{ selectedProject?.path || "No projects assigned" }}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{{ selectedProject?.description || "No description" }}</dd>
                </div>
              </dl>
              <button
                id="deleteProject"
                class="danger"
                type="button"
                :disabled="!selectedProject?.managed || projectDeleteBusy"
                @click="deleteSelectedProject"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>

        <div v-else class="management-panel" role="tabpanel">
          <div class="section-heading">
            <h2>User Management</h2>
            <p>Create users, change roles and passwords, and assign project access.</p>
          </div>
          <div class="management-grid users-management-grid">
            <form class="project-form admin-card" @submit.prevent="createNewUser">
              <h3>Create User</h3>
              <label>
                <span>New Username</span>
                <input v-model="newUserForm.username" autocomplete="off" required />
              </label>
              <label>
                <span>New Password</span>
                <input v-model="newUserForm.password" type="password" autocomplete="new-password" required />
              </label>
              <label>
                <span>New Role</span>
                <select v-model="newUserForm.role" class="project-select">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button type="submit" :disabled="userFormBusy">Create User</button>
              <p id="userFormStatus" class="form-status" :class="userFormTone">{{ userFormStatus }}</p>
            </form>

            <div class="user-list">
              <article v-for="user in users" :key="user.id" class="user-card" :data-user-row="user.username">
                <div class="user-card-header">
                  <strong>{{ user.username }}</strong>
                  <span>{{ user.status }}</span>
                </div>
                <label>
                  <span>Role</span>
                  <select v-model="userEdits[user.id].role" class="project-select">
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label>
                  <span>Password</span>
                  <input v-model="userEdits[user.id].password" type="password" placeholder="New password" />
                </label>
                <div class="user-actions">
                  <button type="button" @click="saveUser(user)">Save User</button>
                  <button type="button" @click="toggleUserStatus(user)">{{ user.status === "active" ? "Disable" : "Enable" }}</button>
                  <button class="danger" type="button" @click="deleteUser(user)">Delete</button>
                </div>
                <fieldset class="assignment-list">
                  <legend>Projects</legend>
                  <label v-for="project in config.projects" :key="project.id" class="assignment-item">
                    <input
                      v-model="userEdits[user.id].projectIds"
                      type="checkbox"
                      :value="project.id"
                    />
                    <span>{{ project.name }}</span>
                  </label>
                </fieldset>
                <button type="button" @click="saveUserProjects(user)">Save Projects</button>
                <p class="user-status-message form-status" :class="userEdits[user.id].tone">{{ userEdits[user.id].message }}</p>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="passwordDialogOpen" class="modal-backdrop">
      <form class="modal-panel" @submit.prevent="submitPasswordChange">
        <div class="modal-header">
          <h2>Change Password</h2>
          <button class="link-button" type="button" @click="closePasswordDialog">Close</button>
        </div>
        <label>
          <span>Current Password</span>
          <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label>
          <span>New Password</span>
          <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required />
        </label>
        <button type="submit" :disabled="passwordFormBusy">Save Password</button>
        <p id="passwordFormStatus" class="form-status" :class="passwordFormTone">{{ passwordFormStatus }}</p>
      </form>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { Terminal } from "@xterm/xterm";

type AgentConfig = { id: string; name: string; command: string; args?: string; cwd: string };
type ProjectConfig = { id: string; name: string; path: string; description?: string; managed?: boolean };
type UserRole = "admin" | "user";
type UserStatus = "active" | "disabled" | "deleted";
type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  projectIds: string[];
};
type PublicRuntimeConfig = { agents: AgentConfig[]; projects: ProjectConfig[]; defaultProjectId: string; webPort: number };
type AgentEntry = AgentConfig & { autostart: boolean; restart_on_exit: boolean; env?: Record<string, string> };
type TuimuxPane = { paneId: string; entry: AgentEntry; status: "running" | "stopped" | "error"; buffer: string; runId?: number };
type TuimuxWindow = { id: string; title: string; layout: unknown; activePaneId: string };
type TuimuxState = {
  connected: boolean;
  serverVersion?: string;
  windows: TuimuxWindow[];
  panes: TuimuxPane[];
  activeWindowId: string | null;
  activePaneId: string | null;
};
type TerminalEntry = { windowState: TuimuxWindow; pane: TuimuxPane };
type TerminalRecord = {
  term: Terminal;
  host: HTMLElement;
  resizeObserver: ResizeObserver;
  inputDisposable: { dispose: () => void };
};
type ServerMessage = { type?: unknown; config?: unknown; state?: unknown; paneId?: unknown; data?: unknown };
type AppView = "workspace" | "manage";
type AdminTab = "projects" | "users";

const config = reactive<PublicRuntimeConfig>({ agents: [], projects: [], defaultProjectId: "", webPort: 0 });
const state = reactive<TuimuxState>({
  connected: false,
  windows: [],
  panes: [],
  activeWindowId: null,
  activePaneId: null
});
const currentUser = ref<PublicUser | null>(null);
const users = ref<PublicUser[]>([]);
const userEdits = reactive<Record<string, { role: UserRole; password: string; projectIds: string[]; message: string; tone: string }>>({});
const loginForm = reactive({ username: "admin", password: "admin" });
const projectForm = reactive({ name: "", path: "", description: "" });
const newUserForm = reactive<{ username: string; password: string; role: UserRole }>({ username: "", password: "", role: "user" });
const passwordForm = reactive({ currentPassword: "", newPassword: "" });
const selectedProjectId = ref("");
const activePaneId = ref<string | null>(null);
const activeView = ref<AppView>("workspace");
const adminTab = ref<AdminTab>("projects");
const accountMenuOpen = ref(false);
const passwordDialogOpen = ref(false);
const loginError = ref("");
const projectFormStatus = ref("");
const projectFormTone = ref("");
const userFormStatus = ref("");
const userFormTone = ref("");
const passwordFormStatus = ref("");
const passwordFormTone = ref("");
const loginBusy = ref(false);
const projectFormBusy = ref(false);
const projectDeleteBusy = ref(false);
const userFormBusy = ref(false);
const passwordFormBusy = ref(false);
const socket = ref<WebSocket | null>(null);
const reconnectTimer = ref<number | null>(null);
const connectionLabel = ref("Connecting");
const terminals = new Map<string, TerminalRecord>();

const isAdmin = computed(() => currentUser.value?.role === "admin");
const selectedProject = computed(() => config.projects.find((project) => project.id === selectedProjectId.value) || config.projects[0]);
const terminalEntries = computed<TerminalEntry[]>(() =>
  state.windows.flatMap((windowState) => {
    const pane = paneForWindow(windowState);
    return pane ? [{ windowState, pane }] : [];
  })
);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  }
  return payload as T;
}

async function initAuth(): Promise<void> {
  const payload = await requestJson<{ user: PublicUser | null }>("/api/auth/me");
  currentUser.value = payload.user;
  if (currentUser.value) {
    await afterAuthenticated();
  }
}

async function afterAuthenticated(): Promise<void> {
  await fetchConfig();
  if (isAdmin.value) {
    await fetchUsers();
  }
  connect();
}

async function login(): Promise<void> {
  loginBusy.value = true;
  loginError.value = "";
  try {
    const payload = await requestJson<{ user: PublicUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(loginForm)
    });
    currentUser.value = payload.user;
    await afterAuthenticated();
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : "Login failed";
  } finally {
    loginBusy.value = false;
  }
}

async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST", body: "{}" });
  disconnect();
  currentUser.value = null;
  users.value = [];
  activeView.value = "workspace";
  adminTab.value = "projects";
  accountMenuOpen.value = false;
  passwordDialogOpen.value = false;
  applyConfig({ agents: [], projects: [], defaultProjectId: "", webPort: 0 });
  applyState({ connected: false, windows: [], panes: [], activeWindowId: null, activePaneId: null });
}

async function fetchConfig(): Promise<void> {
  const nextConfig = await requestJson<PublicRuntimeConfig>("/api/config");
  applyConfig(nextConfig);
}

async function fetchUsers(): Promise<void> {
  const payload = await requestJson<{ users: PublicUser[] }>("/api/users");
  setUsers(payload.users);
}

function setUsers(nextUsers: PublicUser[]): void {
  users.value = nextUsers;
  for (const user of nextUsers) {
    userEdits[user.id] = {
      role: user.role,
      password: "",
      projectIds: [...user.projectIds],
      message: "",
      tone: ""
    };
  }
}

function connect(): void {
  disconnect();
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
    if (currentUser.value) {
      reconnectTimer.value = window.setTimeout(connect, 800);
    }
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

function disconnect(): void {
  if (reconnectTimer.value) {
    window.clearTimeout(reconnectTimer.value);
    reconnectTimer.value = null;
  }
  socket.value?.close();
  socket.value = null;
  for (const paneId of [...terminals.keys()]) {
    disposeTerminal(paneId);
  }
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
  if (config.defaultProjectId && config.projects.some((project) => project.id === config.defaultProjectId)) {
    return config.defaultProjectId;
  }
  return config.projects[0]?.id || "";
}

function persistSelectedProject(): void {
  if (selectedProjectId.value) {
    localStorage.setItem("tycho-project-id", selectedProjectId.value);
  }
}

function showWorkspace(): void {
  activeView.value = "workspace";
}

function showManagement(): void {
  if (!isAdmin.value) {
    return;
  }
  activeView.value = "manage";
  adminTab.value = "projects";
}

function toggleAccountMenu(): void {
  accountMenuOpen.value = !accountMenuOpen.value;
}

function openManagementFromMenu(): void {
  accountMenuOpen.value = false;
  showManagement();
}

function openPasswordDialog(): void {
  accountMenuOpen.value = false;
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  setPasswordFormStatus("");
  passwordDialogOpen.value = true;
}

function closePasswordDialog(): void {
  passwordDialogOpen.value = false;
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  setPasswordFormStatus("");
}

function createSession(agentId: string): void {
  send({ type: "create_session", agentId, projectId: selectedProjectId.value });
}

async function submitPasswordChange(): Promise<void> {
  passwordFormBusy.value = true;
  setPasswordFormStatus("Saving password");
  try {
    await requestJson<{ ok: boolean }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify(passwordForm)
    });
    passwordForm.currentPassword = "";
    passwordForm.newPassword = "";
    setPasswordFormStatus("Password changed", "success");
  } catch (error) {
    setPasswordFormStatus(error instanceof Error ? error.message : "Could not change password", "error");
  } finally {
    passwordFormBusy.value = false;
  }
}

async function submitProjectForm(): Promise<void> {
  setProjectFormStatus("Adding project");
  projectFormBusy.value = true;
  try {
    const payload = await requestJson<{ project: ProjectConfig; config: PublicRuntimeConfig }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(projectForm)
    });
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
  if (!selectedProject.value?.managed || !confirm(`Delete project "${selectedProject.value.name}" from Tycho?`)) {
    return;
  }
  projectDeleteBusy.value = true;
  try {
    const payload = await requestJson<{ ok: boolean; config: PublicRuntimeConfig }>(`/api/projects/${encodeURIComponent(selectedProject.value.id)}`, {
      method: "DELETE"
    });
    applyConfig(payload.config);
    setProjectFormStatus("Project deleted", "success");
  } catch (error) {
    setProjectFormStatus(error instanceof Error ? error.message : "Could not delete project", "error");
  } finally {
    projectDeleteBusy.value = false;
  }
}

async function createNewUser(): Promise<void> {
  userFormBusy.value = true;
  setUserFormStatus("Creating user");
  try {
    const payload = await requestJson<{ users: PublicUser[] }>("/api/users", {
      method: "POST",
      body: JSON.stringify(newUserForm)
    });
    newUserForm.username = "";
    newUserForm.password = "";
    newUserForm.role = "user";
    setUsers(payload.users);
    setUserFormStatus("User created", "success");
  } catch (error) {
    setUserFormStatus(error instanceof Error ? error.message : "Could not create user", "error");
  } finally {
    userFormBusy.value = false;
  }
}

async function saveUser(user: PublicUser): Promise<void> {
  const edit = userEdits[user.id];
  try {
    const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: edit.role, password: edit.password })
    });
    setUsers(payload.users);
    userEdits[user.id].message = "User saved";
    userEdits[user.id].tone = "success";
  } catch (error) {
    edit.message = error instanceof Error ? error.message : "Could not save user";
    edit.tone = "error";
  }
}

async function toggleUserStatus(user: PublicUser): Promise<void> {
  const nextStatus = user.status === "active" ? "disabled" : "active";
  const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus })
  });
  setUsers(payload.users);
}

async function deleteUser(user: PublicUser): Promise<void> {
  if (!confirm(`Delete user "${user.username}" from Tycho?`)) {
    return;
  }
  const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}`, { method: "DELETE" });
  setUsers(payload.users);
}

async function saveUserProjects(user: PublicUser): Promise<void> {
  const edit = userEdits[user.id];
  try {
    const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}/projects`, {
      method: "PUT",
      body: JSON.stringify({ projectIds: edit.projectIds })
    });
    setUsers(payload.users);
    userEdits[user.id].message = "Projects saved";
    userEdits[user.id].tone = "success";
  } catch (error) {
    edit.message = error instanceof Error ? error.message : "Could not save projects";
    edit.tone = "error";
  }
}

function setProjectFormStatus(message: string, tone = ""): void {
  projectFormStatus.value = message;
  projectFormTone.value = tone;
}

function setUserFormStatus(message: string, tone = ""): void {
  userFormStatus.value = message;
  userFormTone.value = tone;
}

function setPasswordFormStatus(message: string, tone = ""): void {
  passwordFormStatus.value = message;
  passwordFormTone.value = tone;
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

onMounted(() => {
  void initAuth();
});

onUnmounted(disconnect);
</script>
