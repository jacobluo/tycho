<template>
  <div class="workspace-layout">
    <aside class="workspace-sidebar">
      <div>
        <h2>Connection</h2>
        <p id="connectionStatus" class="status" :class="{ connected: state.connected }">
          {{ state.connected ? "Connected" : connectionLabel }}
        </p>
      </div>

      <div class="projects">
        <h2>Project</h2>
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
            @click="emit('create-session', agent.id)"
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
            :class="{ active: selectedWindowId === windowState.id }"
            @click="emit('focus-window', windowState.id)"
          >
            <div class="session-item-main">
              <strong>{{ windowState.title }}</strong>
              <span>{{ paneForWindow(windowState)?.status || "starting" }}</span>
              <small>{{ paneForWindow(windowState)?.entry.cwd || "" }}</small>
            </div>
            <button
              class="session-close-button danger"
              type="button"
              :aria-label="`Close ${windowState.title}`"
              @click.stop="emit('close-window', windowState.id)"
            >
              Close
            </button>
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
      </header>

      <div id="terminalGrid" class="terminal-grid" :class="{ empty: terminalEntries.length === 0 }">
        <div v-if="terminalEntries.length === 0" class="empty-state">Start an agent to open a live TUI panel.</div>

        <article
          v-for="entry in terminalEntries"
          v-else
          :key="entry.windowState.id"
          class="terminal-card"
          :class="{ active: selectedWindowId === entry.windowState.id }"
          :data-window-id="entry.windowState.id"
          :data-pane-id="entry.pane.paneId"
          @pointerdown="emit('card-pointer-down', $event, entry)"
        >
          <div class="terminal-titlebar">
            <div class="terminal-title">
              <strong>{{ entry.windowState.title }}</strong>
              <span>{{ entry.pane.status }} / {{ entry.pane.entry.cwd }}</span>
            </div>
            <div class="terminal-actions">
              <button class="danger" type="button" @click="emit('close-window', entry.windowState.id)">Close</button>
            </div>
          </div>
          <div
            class="terminal-host"
            tabindex="0"
            :ref="(el) => emit('set-terminal-host', entry, el)"
            @pointerdown="emit('focus-pane', entry)"
            @focus="emit('focus-pane', entry)"
          ></div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { PublicRuntimeConfig, ProjectConfig, TerminalEntry, TuimuxState, TuimuxWindow } from "../client-types";

defineProps<{
  config: PublicRuntimeConfig;
  state: TuimuxState;
  selectedProjectId: string;
  selectedProject?: ProjectConfig;
  terminalEntries: TerminalEntry[];
  selectedWindowId: string | null;
  connectionLabel: string;
  paneForWindow: (windowState: TuimuxWindow) => TerminalEntry["pane"] | undefined;
}>();

const emit = defineEmits<{
  "create-session": [agentId: string];
  "focus-window": [windowId: string];
  "close-window": [windowId: string];
  "focus-pane": [entry: TerminalEntry];
  "card-pointer-down": [event: PointerEvent, entry: TerminalEntry];
  "set-terminal-host": [entry: TerminalEntry, element: Element | ComponentPublicInstance | null];
}>();
</script>
