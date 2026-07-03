<template>
  <main class="admin-content">
    <div class="section-heading">
      <h2>Session Management</h2>
      <p>Review live TUI sessions across users, inspect current output, or close sessions from the backend.</p>
    </div>

    <div class="admin-list-shell">
      <div class="admin-toolbar" aria-label="Session actions">
        <div>
          <strong>{{ sessions.length }} sessions</strong>
          <span>{{ loading ? "Refreshing" : "Live tuimux state" }}</span>
        </div>
        <div class="admin-toolbar-actions">
          <button type="button" :disabled="loading" @click="loadSessions">Refresh</button>
        </div>
      </div>

      <p v-if="statusMessage" id="sessionAdminStatus" class="form-status" :class="statusTone">{{ statusMessage }}</p>

      <table class="admin-table" aria-label="Sessions">
        <thead>
          <tr>
            <th>Session</th>
            <th>Creator</th>
            <th>Created</th>
            <th>Agent</th>
            <th>Project</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && sessions.length === 0">
            <td colspan="7">No sessions</td>
          </tr>
          <tr v-for="session in sessions" :key="session.windowId">
            <td><strong>{{ session.name }}</strong></td>
            <td>{{ session.creator }}</td>
            <td>{{ formatDate(session.createdAt) }}</td>
            <td>{{ session.agent }}</td>
            <td>
              <span>{{ session.projectName || "Unknown project" }}</span>
              <small class="table-muted">{{ session.projectPath }}</small>
            </td>
            <td>{{ session.status }}</td>
            <td class="row-actions">
              <button type="button" @click="viewSession(session)">View</button>
              <button class="danger" type="button" @click="deleteSession(session)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <aside v-if="activeSession" class="admin-drawer session-detail-drawer" aria-label="Session details">
      <div class="drawer-header">
        <div>
          <h3>Session Details</h3>
          <p>{{ activeSession.name }}</p>
        </div>
        <button class="link-button" type="button" @click="activeSession = null">Close</button>
      </div>

      <dl class="drawer-details">
        <div>
          <dt>Creator</dt>
          <dd>{{ activeSession.creator }}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{{ formatDate(activeSession.createdAt) }}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{{ activeSession.agent }}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{{ activeSession.projectName || "Unknown project" }}</dd>
        </div>
      </dl>

      <pre class="session-buffer">{{ activeSession.buffer || "No output captured yet." }}</pre>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { AdminSessionDetail, AdminSessionSummary } from "../client-types";

const sessions = ref<AdminSessionSummary[]>([]);
const activeSession = ref<AdminSessionDetail | null>(null);
const loading = ref(false);
const statusMessage = ref("");
const statusTone = ref("");

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  }
  return payload as T;
}

function setStatus(message: string, tone = ""): void {
  statusMessage.value = message;
  statusTone.value = tone;
}

async function loadSessions(): Promise<void> {
  loading.value = true;
  try {
    const payload = await requestJson<{ sessions: AdminSessionSummary[] }>("/api/admin/sessions");
    sessions.value = payload.sessions;
    setStatus("");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not load sessions", "error");
  } finally {
    loading.value = false;
  }
}

async function viewSession(session: AdminSessionSummary): Promise<void> {
  try {
    const payload = await requestJson<{ session: AdminSessionDetail }>(`/api/admin/sessions/${encodeURIComponent(session.windowId)}`);
    activeSession.value = payload.session;
    setStatus("");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not load session", "error");
  }
}

async function deleteSession(session: AdminSessionSummary): Promise<void> {
  try {
    await requestJson<{ ok: boolean }>(`/api/admin/sessions/${encodeURIComponent(session.windowId)}`, { method: "DELETE" });
    sessions.value = sessions.value.filter((candidate) => candidate.windowId !== session.windowId);
    if (activeSession.value?.windowId === session.windowId) {
      activeSession.value = null;
    }
    setStatus("Session deleted", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not delete session", "error");
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  return value.slice(0, 19).replace("T", " ");
}

onMounted(() => {
  void loadSessions();
});
</script>
