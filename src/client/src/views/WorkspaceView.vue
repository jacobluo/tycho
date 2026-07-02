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
        <div class="layout-switcher" role="group" aria-label="Session layout">
          <button
            v-for="option in layoutOptions"
            :key="option.mode"
            type="button"
            :aria-label="option.ariaLabel"
            :class="{ active: layoutMode === option.mode }"
            @click="emit('set-layout-mode', option.mode)"
          >
            {{ option.label }}
          </button>
        </div>
      </header>

      <div id="terminalGrid" class="terminal-grid" :class="[`layout-${layoutClass}`, { empty: state.windows.length === 0 }]">
        <div v-if="state.windows.length === 0" class="empty-state">Start an agent to open a live TUI panel.</div>

        <article
          v-for="entry in slotEntries"
          v-else
          :key="entry.slotId"
          class="terminal-card"
          :class="{ active: activeSlotId === entry.slotId }"
          :data-slot-id="entry.slotId"
          :data-session-title="entry.windowState?.title || ''"
          :data-window-id="entry.windowState?.id || ''"
          :data-pane-id="entry.pane?.paneId || ''"
          @pointerdown="emit('card-pointer-down', $event, entry)"
        >
          <div class="terminal-titlebar">
            <div class="terminal-title">
              <select
                class="slot-session-select"
                :aria-label="`Session for ${entry.label}`"
                :value="entry.windowState?.id || ''"
                @change="emit('assign-slot-window', entry.slotId, ($event.target as HTMLSelectElement).value || null)"
              >
                <option value="">Empty</option>
                <option v-for="windowState in state.windows" :key="windowState.id" :value="windowState.id">
                  {{ windowState.title }}
                </option>
              </select>
              <span v-if="entry.pane">{{ entry.pane.status }} / {{ entry.pane.entry.cwd }}</span>
              <span v-else>{{ entry.label }}</span>
            </div>
            <div class="terminal-actions">
              <button type="button" :disabled="!entry.windowState" @click="emit('clear-slot', entry.slotId)">Hide</button>
              <button
                class="danger"
                type="button"
                :disabled="!entry.windowState"
                @click="entry.windowState && emit('close-window', entry.windowState.id)"
              >
                Close Session
              </button>
            </div>
          </div>
          <div
            v-if="entry.pane"
            class="terminal-host"
            tabindex="0"
            :ref="(el) => emit('set-terminal-host', entry, el)"
            @pointerdown="emit('focus-pane', entry)"
            @focus="emit('focus-pane', entry)"
          ></div>
          <button v-else class="slot-empty-state" type="button" @click="emit('set-active-slot', entry.slotId)">
            Choose a session for {{ entry.label }}
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import type { SessionLayoutMode, SessionSlotId } from "../../../shared/session-slots";
import type { PublicRuntimeConfig, ProjectConfig, TerminalEntry, TerminalSlotEntry, TuimuxState, TuimuxWindow } from "../client-types";

const layoutOptions: { mode: SessionLayoutMode; label: string; ariaLabel: string }[] = [
  { mode: "auto", label: "Auto", ariaLabel: "Auto layout" },
  { mode: "single", label: "1", ariaLabel: "Single session layout" },
  { mode: "two-vertical", label: "2 |", ariaLabel: "Two vertical layout" },
  { mode: "two-horizontal", label: "2 =", ariaLabel: "Two horizontal layout" },
  { mode: "quad", label: "4", ariaLabel: "Four session layout" }
];

defineProps<{
  config: PublicRuntimeConfig;
  state: TuimuxState;
  selectedProjectId: string;
  selectedProject?: ProjectConfig;
  terminalEntries: TerminalEntry[];
  slotEntries: TerminalSlotEntry[];
  selectedWindowId: string | null;
  layoutMode: SessionLayoutMode;
  layoutClass: SessionLayoutMode;
  activeSlotId: SessionSlotId;
  visibleSlotIds: SessionSlotId[];
  connectionLabel: string;
  paneForWindow: (windowState: TuimuxWindow) => TerminalEntry["pane"] | undefined;
}>();

const emit = defineEmits<{
  "create-session": [agentId: string];
  "focus-window": [windowId: string];
  "close-window": [windowId: string];
  "set-layout-mode": [mode: SessionLayoutMode];
  "set-active-slot": [slotId: SessionSlotId];
  "assign-slot-window": [slotId: SessionSlotId, windowId: string | null];
  "clear-slot": [slotId: SessionSlotId];
  "focus-pane": [entry: TerminalSlotEntry];
  "card-pointer-down": [event: PointerEvent, entry: TerminalSlotEntry];
  "set-terminal-host": [entry: TerminalSlotEntry, element: Element | ComponentPublicInstance | null];
}>();
</script>
