<template>
  <div ref="switcherRoot" class="topbar-project-select project-switcher-wrap">
    <span id="projectSwitcherLabel" class="project-switcher-label">Project</span>
    <button
      class="project-switcher-trigger"
      data-project-switcher-trigger
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="menuOpen"
      :aria-label="`Project ${selectedProject?.name || 'No project'}`"
      :data-selected-project-id="selectedProjectId"
      :disabled="projects.length === 0"
      @click="toggleMenu"
    >
      <span class="project-switcher-name">{{ selectedProject?.name || "No project" }}</span>
      <span aria-hidden="true" class="project-switcher-chevron">⌄</span>
    </button>
    <div v-if="menuOpen" class="project-switcher-menu" role="listbox" aria-label="Projects">
      <button
        v-for="project in projects"
        :key="project.id"
        class="project-switcher-option"
        role="option"
        type="button"
        :aria-label="project.name"
        :aria-selected="project.id === selectedProjectId"
        @click="selectProject(project.id)"
      >
        <span class="project-switcher-option-name">{{ project.name }}</span>
        <small>{{ project.path }}</small>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { ProjectConfig } from "../client-types";

const props = defineProps<{
  projects: ProjectConfig[];
  selectedProjectId: string;
}>();

const emit = defineEmits<{
  "update:selectedProjectId": [projectId: string];
  change: [];
}>();

const menuOpen = ref(false);
const switcherRoot = ref<HTMLElement | null>(null);
const selectedProject = computed(() => props.projects.find((project) => project.id === props.selectedProjectId) || props.projects[0]);

function closeMenu(): void {
  menuOpen.value = false;
}

function toggleMenu(): void {
  if (props.projects.length === 0) {
    return;
  }
  menuOpen.value = !menuOpen.value;
}

function selectProject(projectId: string): void {
  if (projectId !== props.selectedProjectId) {
    emit("update:selectedProjectId", projectId);
    emit("change");
  }
  closeMenu();
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!menuOpen.value || !switcherRoot.value) {
    return;
  }
  if (event.target instanceof Node && switcherRoot.value.contains(event.target)) {
    return;
  }
  closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>
