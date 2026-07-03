<template>
  <div v-if="open" class="project-files-backdrop">
    <aside
      class="project-files-drawer"
      role="dialog"
      aria-label="Project files"
      :style="{ '--project-files-width': `${width}px` }"
    >
      <div class="project-files-resize-handle" aria-hidden="true" @pointerdown="startResize"></div>
      <header class="project-files-header">
        <div>
          <h2>{{ project?.name || "Project files" }}</h2>
          <p class="project-files-path">{{ displayPath }}</p>
        </div>
        <div class="project-files-actions">
          <button type="button" @click="refresh">Refresh</button>
          <button type="button" @click="emit('close')">Close</button>
        </div>
      </header>

      <label class="project-files-search">
        <span>Project file search</span>
        <input v-model="filterText" aria-label="Project file search" autocomplete="off" />
      </label>

      <p v-if="errorMessage" class="project-files-status error">{{ errorMessage }}</p>
      <p v-else-if="loading" class="project-files-status">Loading files</p>

      <div class="project-files-body">
        <section class="project-files-list" aria-label="Project file entries">
          <button
            v-if="listing && listing.parentPath !== null"
            class="project-file-row"
            type="button"
            aria-label="Up"
            @click="loadDirectory(listing?.parentPath || '')"
          >
            <span class="project-file-kind" aria-hidden="true">Up</span>
            <span class="project-file-main">
              <strong>..</strong>
              <small>Parent directory</small>
            </span>
          </button>
          <button
            v-for="entry in filteredEntries"
            :key="entry.relativePath"
            class="project-file-row"
            :class="{ selected: selectedEntry?.relativePath === entry.relativePath }"
            type="button"
            :aria-label="entry.type === 'directory' ? `Open ${entry.name}` : `Preview ${entry.name}`"
            @click="entry.type === 'directory' ? loadDirectory(entry.relativePath) : selectFile(entry)"
          >
            <span class="project-file-kind" aria-hidden="true">{{ entry.type === "directory" ? "Dir" : "File" }}</span>
            <span class="project-file-main">
              <strong>{{ entry.name }}</strong>
              <small>{{ entry.relativePath || "." }}</small>
            </span>
            <span class="project-file-meta">{{ entry.sensitive ? "Sensitive" : formatSize(entry.size) }}</span>
          </button>
          <p v-if="!loading && filteredEntries.length === 0" class="project-files-empty">No files</p>
        </section>

        <section class="project-files-preview" aria-label="Project file preview">
          <div class="project-files-preview-actions">
            <button type="button" :disabled="!selectedEntry || selectedEntry.type !== 'file'" @click="reloadPreview">Preview</button>
            <button type="button" :disabled="!selectedEntry" @click="copyPath">Copy Path</button>
            <button type="button" :disabled="!canCopyContent" @click="copyContent">Copy Content</button>
          </div>
          <p v-if="copyStatus" class="project-files-status success">{{ copyStatus }}</p>
          <p v-if="previewLoading" class="project-files-status">Loading preview</p>
          <p v-else-if="previewMessage" class="project-files-status">{{ previewMessage }}</p>
          <pre v-if="activePreview?.previewable" class="project-preview-content">{{ activePreview.content }}</pre>
        </section>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { ProjectConfig, ProjectDirectoryListing, ProjectFileEntry, ProjectFilePreview } from "../client-types";

const props = defineProps<{
  open: boolean;
  project?: ProjectConfig;
  width: number;
}>();

const emit = defineEmits<{
  close: [];
  "update:width": [width: number];
}>();

const listing = ref<ProjectDirectoryListing | null>(null);
const preview = ref<ProjectFilePreview | null>(null);
const selectedEntry = ref<ProjectFileEntry | null>(null);
const currentPath = ref("");
const filterText = ref("");
const loading = ref(false);
const previewLoading = ref(false);
const errorMessage = ref("");
const copyStatus = ref("");
const resizePointerId = ref<number | null>(null);

const filteredEntries = computed(() => {
  const filter = filterText.value.trim().toLowerCase();
  const entries = listing.value?.entries || [];
  return filter ? entries.filter((entry) => entry.name.toLowerCase().includes(filter)) : entries;
});

const displayPath = computed(() => currentPath.value || ".");
const activePreview = computed(() => {
  if (!selectedEntry.value || !preview.value || preview.value.relativePath !== selectedEntry.value.relativePath) {
    return null;
  }
  return preview.value;
});
const canCopyContent = computed(() =>
  Boolean(
    activePreview.value
      && activePreview.value.previewable
      && activePreview.value.content
  )
);

const previewMessage = computed(() => {
  if (!selectedEntry.value) {
    return "Select a file to preview";
  }
  if (!activePreview.value) {
    return "";
  }
  if (activePreview.value.previewable && activePreview.value.truncated) {
    return "Preview truncated";
  }
  if (activePreview.value.previewable) {
    return "";
  }
  if (activePreview.value.reason === "sensitive") {
    return "Sensitive file cannot be previewed";
  }
  if (activePreview.value.reason === "binary") {
    return "Binary file cannot be previewed";
  }
  if (activePreview.value.reason === "directory") {
    return "Directory cannot be previewed";
  }
  return "File is not available";
});

watch(
  () => [props.open, props.project?.id] as const,
  ([open]) => {
    if (open && props.project) {
      resetDrawer();
      void loadDirectory("");
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopResize();
});

function resetDrawer(): void {
  listing.value = null;
  preview.value = null;
  selectedEntry.value = null;
  currentPath.value = "";
  filterText.value = "";
  errorMessage.value = "";
  copyStatus.value = "";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  }
  return payload as T;
}

async function loadDirectory(path = ""): Promise<void> {
  const project = props.project;
  if (!project) {
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  preview.value = null;
  selectedEntry.value = null;
  copyStatus.value = "";
  filterText.value = "";
  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const nextListing = await fetchJson<ProjectDirectoryListing>(`/api/projects/${encodeURIComponent(project.id)}/files${query}`);
    if (props.project?.id !== project.id) {
      return;
    }
    listing.value = nextListing;
    currentPath.value = nextListing.currentPath;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "File is not available";
  } finally {
    loading.value = false;
  }
}

async function loadPreview(entry: ProjectFileEntry): Promise<void> {
  const project = props.project;
  if (!project) {
    return;
  }
  const relativePath = entry.relativePath;
  previewLoading.value = true;
  errorMessage.value = "";
  copyStatus.value = "";
  try {
    const nextPreview = await fetchJson<ProjectFilePreview>(
      `/api/projects/${encodeURIComponent(project.id)}/files/preview?path=${encodeURIComponent(relativePath)}`
    );
    if (props.project?.id !== project.id || selectedEntry.value?.relativePath !== relativePath) {
      return;
    }
    preview.value = nextPreview;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "File is not available";
  } finally {
    previewLoading.value = false;
  }
}

function selectFile(entry: ProjectFileEntry): void {
  selectedEntry.value = entry;
  preview.value = null;
  copyStatus.value = "";
  void loadPreview(entry);
}

function reloadPreview(): void {
  if (selectedEntry.value?.type === "file") {
    preview.value = null;
    void loadPreview(selectedEntry.value);
  }
}

function refresh(): void {
  void loadDirectory(currentPath.value);
}

async function copyPath(): Promise<void> {
  if (!selectedEntry.value) {
    return;
  }
  await navigator.clipboard.writeText(selectedEntry.value.relativePath || ".");
  copyStatus.value = "Path copied";
}

async function copyContent(): Promise<void> {
  const contentPreview = activePreview.value;
  if (!canCopyContent.value || !contentPreview) {
    return;
  }
  await navigator.clipboard.writeText(contentPreview.content);
  copyStatus.value = "Content copied";
}

function formatSize(size: number | null): string {
  if (size === null) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function clampWidth(width: number): number {
  const maxWidth = Math.min(860, window.innerWidth - 96);
  return Math.max(360, Math.min(width, maxWidth));
}

function startResize(event: PointerEvent): void {
  resizePointerId.value = event.pointerId;
  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function resize(event: PointerEvent): void {
  emit("update:width", clampWidth(window.innerWidth - event.clientX));
}

function stopResize(): void {
  resizePointerId.value = null;
  window.removeEventListener("pointermove", resize);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
}
</script>
