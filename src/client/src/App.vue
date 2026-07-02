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

  <main v-else class="app-shell routed-shell">
    <header class="app-topbar">
      <div class="brand-row">
        <h1>Tycho</h1>
        <span>{{ routeTitle }}</span>
      </div>
      <div class="topbar-controls">
        <label v-if="isWorkspaceRoute" class="topbar-project-select">
          <span>Project</span>
          <select id="projectSelect" v-model="selectedProjectId" class="project-select" @change="persistSelectedProject">
            <option v-for="project in config.projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
        </label>
        <div class="header-actions">
          <RouterLink v-if="!isWorkspaceRoute" class="button-link" to="/">Workspace</RouterLink>
          <AccountMenu
            :current-user="currentUser"
            :is-admin="isAdmin"
            @change-password="openPasswordDialog"
            @admin="openManagementFromMenu"
            @logout="logout"
          />
        </div>
      </div>
    </header>

    <RouterView v-slot="{ Component }">
      <component
        :is="Component"
        v-model:selected-project-id="selectedProjectId"
        :config="config"
        :state="state"
        :users="users"
        :user-edits="userEdits"
        :project-form="projectForm"
        :new-user-form="newUserForm"
        :selected-project="selectedProject"
        :terminal-entries="terminalEntries"
        :slot-entries="slotEntries"
        :selected-window-id="selectedWindowId"
        :layout-mode="layoutMode"
        :layout-class="layoutClass"
        :active-slot-id="activeSlotId"
        :visible-slot-ids="visibleSlotIds"
        :connection-label="connectionLabel"
        :project-form-status="projectFormStatus"
        :project-form-tone="projectFormTone"
        :user-form-status="userFormStatus"
        :user-form-tone="userFormTone"
        :project-form-busy="projectFormBusy"
        :project-delete-busy="projectDeleteBusy"
        :user-form-busy="userFormBusy"
        :pane-for-window="paneForWindow"
        @persist-selected-project="persistSelectedProject"
        @create-session="openSessionDialog"
        @focus-window="focusWindow"
        @close-window="closeWindow"
        @set-layout-mode="setLayoutMode"
        @set-active-slot="setActiveSlot"
        @assign-slot-window="assignSlotWindow"
        @clear-slot="clearSlot"
        @focus-pane="focusPane"
        @card-pointer-down="handleCardPointerDown"
        @set-terminal-host="setTerminalHost"
        @submit-project-form="submitProjectForm"
        @update-project-form="updateProjectForm"
        @delete-projects="deleteProjects"
        @create-new-user="createNewUser"
        @save-user="saveUser"
        @toggle-user-status="toggleUserStatus"
        @delete-user="deleteUser"
        @save-user-projects="saveUserProjects"
        @delete-users="deleteUsers"
        @toggle-users-status="toggleUsersStatus"
      />
    </RouterView>

    <ChangePasswordDialog
      :open="passwordDialogOpen"
      :busy="passwordFormBusy"
      :status="passwordFormStatus"
      :tone="passwordFormTone"
      :form="passwordForm"
      @close="closePasswordDialog"
      @submit="submitPasswordChange"
    />

    <CreateSessionDialog
      :open="sessionDialogOpen"
      :agent-name="pendingSessionAgent?.name || 'Agent'"
      :form="sessionForm"
      @close="closeSessionDialog"
      @submit="submitSessionDialog"
    />

    <ConfirmSessionCloseDialog
      :open="closeSessionDialogOpen"
      :session-title="pendingCloseWindow?.title || 'Session'"
      @close="closeSessionCloseDialog"
      @confirm="confirmCloseWindow"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { Terminal } from "@xterm/xterm";
import AccountMenu from "./components/AccountMenu.vue";
import ChangePasswordDialog from "./components/ChangePasswordDialog.vue";
import ConfirmSessionCloseDialog from "./components/ConfirmSessionCloseDialog.vue";
import CreateSessionDialog from "./components/CreateSessionDialog.vue";
import { resolveSelectedWindowId } from "../../shared/session-selection";
import {
  allSessionSlotIds,
  assignWindowToSlot,
  clearWindowFromSlots,
  createEmptySlotAssignments,
  pruneSlotAssignments,
  resolveVisibleSlotIds,
  type SessionLayoutMode,
  type SessionSlotId,
  type SlotAssignments
} from "../../shared/session-slots";
import type {
  PublicRuntimeConfig,
  ProjectConfig,
  PublicUser,
  ServerMessage,
  TerminalEntry,
  TerminalRecord,
  TerminalSlotEntry,
  TuimuxPane,
  TuimuxState,
  TuimuxWindow,
  UserEditState,
  UserRole
} from "./client-types";

const route = useRoute();
const router = useRouter();
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
const userEdits = reactive<Record<string, UserEditState>>({});
const loginForm = reactive({ username: "admin", password: "admin" });
const projectForm = reactive({ name: "", path: "", description: "" });
const newUserForm = reactive<{ username: string; password: string; role: UserRole }>({ username: "", password: "", role: "user" });
const passwordForm = reactive({ currentPassword: "", newPassword: "" });
const sessionForm = reactive({ name: "" });
const selectedProjectId = ref("");
const activePaneId = ref<string | null>(null);
const layoutMode = ref<SessionLayoutMode>(readStoredLayoutMode());
const activeSlotId = ref<SessionSlotId>(readStoredActiveSlotId());
const viewportWidth = ref(window.innerWidth);
const slotAssignments = reactive<SlotAssignments>(readStoredSlotAssignments());
const knownWindowIds = ref<Set<string>>(new Set());
const passwordDialogOpen = ref(false);
const sessionDialogOpen = ref(false);
const pendingSessionAgentId = ref<string | null>(null);
const closeSessionDialogOpen = ref(false);
const pendingCloseWindowId = ref<string | null>(null);
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
const isWorkspaceRoute = computed(() => route.path === "/");
const routeTitle = computed(() => {
  if (route.path.startsWith("/admin/users")) {
    return "User Management";
  }
  if (route.path.startsWith("/admin")) {
    return "Project Management";
  }
  return "Workspace";
});
const selectedProject = computed(() => config.projects.find((project) => project.id === selectedProjectId.value) || config.projects[0]);
const pendingSessionAgent = computed(() => config.agents.find((agent) => agent.id === pendingSessionAgentId.value));
const pendingCloseWindow = computed(() => state.windows.find((windowState) => windowState.id === pendingCloseWindowId.value));
const visibleSlotIds = computed(() => resolveVisibleSlotIds(layoutMode.value, viewportWidth.value));
const selectedWindowId = computed(() =>
  resolveSelectedWindowId(state.windows, {
    localActivePaneId: activePaneId.value,
    serverActivePaneId: state.activePaneId,
    serverActiveWindowId: state.activeWindowId
  })
);
const terminalEntries = computed<TerminalEntry[]>(() =>
  state.windows.flatMap((windowState) => {
    const pane = paneForWindow(windowState);
    return pane ? [{ windowState, pane }] : [];
  })
);
const slotEntries = computed<TerminalSlotEntry[]>(() =>
  visibleSlotIds.value.map((slotId, index) => {
    const windowState = state.windows.find((candidate) => candidate.id === slotAssignments[slotId]);
    const pane = windowState ? paneForWindow(windowState) : undefined;
    return {
      slotId,
      label: `Slot ${index + 1}`,
      windowState,
      pane
    };
  })
);
const layoutClass = computed<SessionLayoutMode>(() => {
  if (visibleSlotIds.value.length === 1) {
    return "single";
  }
  if (visibleSlotIds.value.length === 2) {
    return layoutMode.value === "two-horizontal" ? "two-horizontal" : "two-vertical";
  }
  return "quad";
});

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

function isLayoutMode(value: string | null): value is SessionLayoutMode {
  return value === "auto" || value === "single" || value === "two-vertical" || value === "two-horizontal" || value === "quad";
}

function isSlotId(value: string | null): value is SessionSlotId {
  return allSessionSlotIds.includes(value as SessionSlotId);
}

function readStoredLayoutMode(): SessionLayoutMode {
  const stored = localStorage.getItem("tycho-layout-mode");
  return isLayoutMode(stored) ? stored : "auto";
}

function readStoredActiveSlotId(): SessionSlotId {
  const stored = localStorage.getItem("tycho-active-slot-id");
  return isSlotId(stored) ? stored : "slot-1";
}

function readStoredSlotAssignments(): SlotAssignments {
  const assignments = createEmptySlotAssignments();
  const stored = localStorage.getItem("tycho-slot-assignments");
  if (!stored) {
    return assignments;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<Record<SessionSlotId, unknown>>;
    for (const slotId of allSessionSlotIds) {
      const value = parsed[slotId];
      assignments[slotId] = typeof value === "string" ? value : null;
    }
  } catch {
    return assignments;
  }
  return assignments;
}

function persistSlotState(): void {
  localStorage.setItem("tycho-layout-mode", layoutMode.value);
  localStorage.setItem("tycho-active-slot-id", activeSlotId.value);
  localStorage.setItem("tycho-slot-assignments", JSON.stringify(slotAssignments));
}

function replaceSlotAssignments(nextAssignments: SlotAssignments): void {
  for (const slotId of allSessionSlotIds) {
    slotAssignments[slotId] = nextAssignments[slotId];
  }
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
  passwordDialogOpen.value = false;
  closeSessionDialog();
  closeSessionCloseDialog();
  applyConfig({ agents: [], projects: [], defaultProjectId: "", webPort: 0 });
  applyState({ connected: false, windows: [], panes: [], activeWindowId: null, activePaneId: null });
  await router.push("/");
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

function handleViewportResize(): void {
  viewportWidth.value = window.innerWidth;
  syncSlotAssignments();
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
  const previousWindowIds = knownWindowIds.value;
  state.connected = nextState.connected;
  state.serverVersion = nextState.serverVersion;
  state.windows = mergeWindowsPreservingOrder(state.windows, nextState.windows);
  state.panes = nextState.panes;
  state.activeWindowId = nextState.activeWindowId;
  state.activePaneId = nextState.activePaneId;
  if (activePaneId.value && !nextState.panes.some((pane) => pane.paneId === activePaneId.value)) {
    activePaneId.value = nextState.activePaneId;
  }
  syncSlotAssignments(previousWindowIds);
  knownWindowIds.value = new Set(state.windows.map((windowState) => windowState.id));
}

function mergeWindowsPreservingOrder(windows: TuimuxWindow[], incomingWindows: TuimuxWindow[]): TuimuxWindow[] {
  const incomingById = new Map(incomingWindows.map((windowState) => [windowState.id, windowState]));
  const existingIds = new Set(windows.map((windowState) => windowState.id));
  const existingWindows = windows.flatMap((windowState) => {
    const incomingWindow = incomingById.get(windowState.id);
    return incomingWindow ? [incomingWindow] : [];
  });
  const newWindows = incomingWindows.filter((windowState) => !existingIds.has(windowState.id));
  return [...existingWindows, ...newWindows];
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

function syncSlotAssignments(previousWindowIds = knownWindowIds.value): void {
  const liveWindowIds = state.windows.map((windowState) => windowState.id);
  const liveWindowIdSet = new Set(liveWindowIds);
  let nextAssignments = pruneSlotAssignments(slotAssignments, liveWindowIds);
  const visibleIds = visibleSlotIds.value;
  if (!visibleIds.includes(activeSlotId.value)) {
    activeSlotId.value = visibleIds[0] ?? "slot-1";
  }

  const assignedWindowIds = new Set(Object.values(nextAssignments).filter((windowId): windowId is string => Boolean(windowId)));
  for (const windowState of state.windows) {
    if (assignedWindowIds.has(windowState.id)) {
      continue;
    }
    const emptySlotId = visibleIds.find((slotId) => !nextAssignments[slotId]);
    if (!emptySlotId) {
      break;
    }
    nextAssignments = assignWindowToSlot(nextAssignments, emptySlotId, windowState.id);
    assignedWindowIds.add(windowState.id);
  }

  const newWindow = state.windows.find((windowState) => !previousWindowIds.has(windowState.id));
  const newWindowAssigned = newWindow ? Object.values(nextAssignments).includes(newWindow.id) : false;
  if (newWindow && previousWindowIds.size > 0 && liveWindowIdSet.has(newWindow.id) && !newWindowAssigned) {
    nextAssignments = assignWindowToSlot(nextAssignments, activeSlotId.value, newWindow.id);
    activePaneId.value = newWindow.activePaneId;
  }

  replaceSlotAssignments(nextAssignments);
  persistSlotState();
}

function persistSelectedProject(): void {
  if (selectedProjectId.value) {
    localStorage.setItem("tycho-project-id", selectedProjectId.value);
  }
}

function openManagementFromMenu(): void {
  if (!isAdmin.value) {
    return;
  }
  void router.push("/admin/projects");
}

function openPasswordDialog(): void {
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

function openSessionDialog(agentId: string): void {
  pendingSessionAgentId.value = agentId;
  sessionForm.name = "";
  sessionDialogOpen.value = true;
}

function closeSessionDialog(): void {
  sessionDialogOpen.value = false;
  pendingSessionAgentId.value = null;
  sessionForm.name = "";
}

function submitSessionDialog(): void {
  const agentId = pendingSessionAgentId.value;
  const label = sessionForm.name.trim();
  if (!agentId || label.length === 0) {
    return;
  }
  send({ type: "create_session", agentId, projectId: selectedProjectId.value, label });
  closeSessionDialog();
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

async function updateProjectForm(projectId: string): Promise<void> {
  setProjectFormStatus("Updating project");
  projectFormBusy.value = true;
  try {
    const payload = await requestJson<{ project: ProjectConfig; config: PublicRuntimeConfig }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify(projectForm)
    });
    applyConfig(payload.config, payload.project.id);
    setProjectFormStatus("Project updated", "success");
  } catch (error) {
    setProjectFormStatus(error instanceof Error ? error.message : "Could not update project", "error");
  } finally {
    projectFormBusy.value = false;
  }
}

async function deleteProjects(projectIds: string[]): Promise<void> {
  const projects = projectIds
    .map((projectId) => config.projects.find((project) => project.id === projectId))
    .filter((project): project is ProjectConfig => Boolean(project?.managed));
  if (projects.length === 0 || !confirm(`Delete ${projects.length} selected project${projects.length === 1 ? "" : "s"} from Tycho?`)) {
    return;
  }
  projectDeleteBusy.value = true;
  try {
    let nextConfig: PublicRuntimeConfig | null = null;
    for (const project of projects) {
      const payload = await requestJson<{ ok: boolean; config: PublicRuntimeConfig }>(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE"
      });
      nextConfig = payload.config;
    }
    if (nextConfig) {
      applyConfig(nextConfig);
    }
    setProjectFormStatus(projects.length === 1 ? "Project deleted" : "Projects deleted", "success");
  } catch (error) {
    setProjectFormStatus(error instanceof Error ? error.message : "Could not delete projects", "error");
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

async function toggleUsersStatus(selectedUsers: PublicUser[]): Promise<void> {
  for (const user of selectedUsers) {
    await toggleUserStatus(user);
  }
}

async function deleteUser(user: PublicUser): Promise<void> {
  if (!confirm(`Delete user "${user.username}" from Tycho?`)) {
    return;
  }
  const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}`, { method: "DELETE" });
  setUsers(payload.users);
}

async function deleteUsers(selectedUsers: PublicUser[]): Promise<void> {
  if (selectedUsers.length === 0 || !confirm(`Delete ${selectedUsers.length} selected user${selectedUsers.length === 1 ? "" : "s"} from Tycho?`)) {
    return;
  }
  for (const user of selectedUsers) {
    const payload = await requestJson<{ users: PublicUser[] }>(`/api/users/${user.id}`, { method: "DELETE" });
    setUsers(payload.users);
  }
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

function setLayoutMode(mode: SessionLayoutMode): void {
  layoutMode.value = mode;
  syncSlotAssignments();
}

function setActiveSlot(slotId: SessionSlotId): void {
  activeSlotId.value = slotId;
  persistSlotState();
}

function assignSlotWindow(slotId: SessionSlotId, windowId: string | null): void {
  setActiveSlot(slotId);
  replaceSlotAssignments(assignWindowToSlot(slotAssignments, slotId, windowId));
  persistSlotState();
  if (windowId) {
    focusWindow(windowId);
  }
}

function clearSlot(slotId: SessionSlotId): void {
  replaceSlotAssignments(assignWindowToSlot(slotAssignments, slotId, null));
  persistSlotState();
}

function focusWindow(windowId: string): void {
  replaceSlotAssignments(assignWindowToSlot(slotAssignments, activeSlotId.value, windowId));
  persistSlotState();
  const windowState = state.windows.find((candidate) => candidate.id === windowId);
  const pane = windowState ? paneForWindow(windowState) : undefined;
  if (pane) {
    activePaneId.value = pane.paneId;
  }
  send({ type: "focus_window", windowId });
  if (pane) {
    focusTerminal(pane.paneId);
  }
}

function closeWindow(windowId: string): void {
  pendingCloseWindowId.value = windowId;
  closeSessionDialogOpen.value = true;
}

function closeSessionCloseDialog(): void {
  closeSessionDialogOpen.value = false;
  pendingCloseWindowId.value = null;
}

function confirmCloseWindow(): void {
  const windowId = pendingCloseWindowId.value;
  if (!windowId) {
    return;
  }
  replaceSlotAssignments(clearWindowFromSlots(slotAssignments, windowId));
  persistSlotState();
  send({ type: "close_window", windowId });
  closeSessionCloseDialog();
}

function focusPane(entry: TerminalEntry | TerminalSlotEntry): void {
  if ("slotId" in entry && entry.pane && entry.windowState) {
    setActiveSlot(entry.slotId);
  }
  if (!entry.pane || !entry.windowState) {
    return;
  }
  activePaneId.value = entry.pane.paneId;
  send({ type: "focus_window", windowId: entry.windowState.id });
  focusTerminal(entry.pane.paneId);
}

function handleCardPointerDown(event: PointerEvent, entry: TerminalEntry | TerminalSlotEntry): void {
  if ((event.target as HTMLElement).closest(".terminal-actions")) {
    return;
  }
  focusPane(entry);
}

function setTerminalHost(entry: TerminalEntry | TerminalSlotEntry, element: Element | ComponentPublicInstance | null): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (!entry.pane || !entry.windowState) {
    return;
  }
  const existing = terminals.get(entry.pane.paneId);
  if (existing?.host === element) {
    return;
  }
  if (existing) {
    disposeTerminal(entry.pane.paneId);
  }
  mountTerminal({ windowState: entry.windowState, pane: entry.pane }, element);
}

function focusTerminal(paneId: string): void {
  void nextTick(() => {
    const record = terminals.get(paneId);
    if (!record) {
      return;
    }
    record.term.focus();
  });
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

watch(
  () => slotEntries.value.map((entry) => entry.pane?.paneId).filter((paneId): paneId is string => Boolean(paneId)),
  (visiblePaneIds) => {
    const visiblePaneIdSet = new Set(visiblePaneIds);
    for (const paneId of terminals.keys()) {
      if (!visiblePaneIdSet.has(paneId)) {
        disposeTerminal(paneId);
      }
    }
    void nextTick(() => {
      for (const paneId of visiblePaneIds) {
        resizeTerminal(paneId);
      }
    });
  }
);

watch(layoutMode, () => {
  syncSlotAssignments();
});

watch(activeSlotId, () => {
  persistSlotState();
});

watch(
  () => ({ ...slotAssignments }),
  () => {
    persistSlotState();
  },
  { deep: true }
);

watch(
  [() => route.path, currentUser, isAdmin],
  ([path, user, admin]) => {
    if (user && path.startsWith("/admin") && !admin) {
      void router.replace("/");
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("resize", handleViewportResize);
  syncSlotAssignments();
  void initAuth();
});

onUnmounted(() => {
  window.removeEventListener("resize", handleViewportResize);
  disconnect();
});
</script>
