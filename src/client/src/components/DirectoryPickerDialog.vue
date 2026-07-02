<template>
  <div v-if="open" class="modal-backdrop directory-picker-backdrop">
    <section class="modal-panel directory-picker" role="dialog" aria-modal="true" aria-labelledby="directoryPickerTitle">
      <div class="drawer-header">
        <div>
          <h3 id="directoryPickerTitle">Choose Project Folder</h3>
          <p>Select a server-side folder, then use it as the project path.</p>
        </div>
        <button class="link-button" type="button" @click="emit('close')">Close</button>
      </div>

      <div class="directory-path-bar">
        <button type="button" :disabled="!parentPath || loading" @click="loadDirectory(parentPath || undefined)">Up</button>
        <code>{{ currentPath || "Configured roots" }}</code>
      </div>

      <p v-if="errorMessage" class="form-status error">{{ errorMessage }}</p>
      <p v-else-if="loading" class="form-status">Loading directories...</p>

      <div class="directory-list" aria-label="Directories">
        <p v-if="!loading && entries.length === 0" class="empty-state">
          {{ roots.length === 0 ? "Directory browsing is not configured." : "No folders available." }}
        </p>
        <div
          v-for="entry in entries"
          :key="entry.path"
          class="directory-row"
          :class="{ selected: selectedPath === entry.path }"
        >
          <button
            class="directory-row-main"
            type="button"
            :aria-label="`Select ${entry.path}`"
            @click="selectedPath = entry.path"
            @dblclick="loadDirectory(entry.path)"
          >
            <span class="directory-icon" aria-hidden="true">Folder</span>
            <span>
              <strong>{{ entry.name }}</strong>
              <small>{{ entry.path }}</small>
            </span>
          </button>
          <button type="button" :aria-label="`Open ${entry.path}`" @click="loadDirectory(entry.path)">Open</button>
        </div>
      </div>

      <div class="directory-dialog-footer">
        <button class="link-button" type="button" @click="emit('close')">Cancel</button>
        <button type="button" :disabled="!selectedPath" @click="useSelectedFolder">Use This Folder</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { DirectoryBrowserEntry, DirectoryBrowserResponse } from "../client-types";

const props = defineProps<{
  open: boolean;
  initialPath: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [path: string];
}>();

const roots = ref<DirectoryBrowserEntry[]>([]);
const entries = ref<DirectoryBrowserEntry[]>([]);
const currentPath = ref<string | null>(null);
const parentPath = ref<string | null>(null);
const selectedPath = ref("");
const loading = ref(false);
const errorMessage = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedPath.value = "";
      void loadDirectory(props.initialPath.trim() || undefined, true);
    }
  }
);

async function fetchDirectories(path?: string): Promise<DirectoryBrowserResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await fetch(`/api/directories${query}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Directory is not available");
  }
  return payload as DirectoryBrowserResponse;
}

async function loadDirectory(path?: string, allowRootFallback = false): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await fetchDirectories(path);
    roots.value = payload.roots;
    entries.value = payload.entries;
    currentPath.value = payload.currentPath;
    parentPath.value = payload.parentPath;
    selectedPath.value = payload.currentPath || "";
  } catch (error) {
    if (path && allowRootFallback) {
      await loadDirectory(undefined);
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : "Directory is not available";
  } finally {
    loading.value = false;
  }
}

function useSelectedFolder(): void {
  if (selectedPath.value) {
    emit("select", selectedPath.value);
  }
}
</script>
