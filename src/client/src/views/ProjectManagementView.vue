<template>
  <main class="admin-content">
    <div class="section-heading">
      <h2>Project Management</h2>
      <p>Review managed projects first, then add, inspect, or remove entries from the toolbar.</p>
    </div>

    <div class="admin-list-shell">
      <div class="admin-toolbar" aria-label="Project actions">
        <div>
          <strong>{{ config.projects.length }} projects</strong>
          <span>{{ selectedProjects.length }} selected</span>
        </div>
        <div class="admin-toolbar-actions">
          <button type="button" @click="openCreateDrawer">Add Project</button>
          <button type="button" :disabled="!canEdit" @click="openEditDrawer">Edit Project</button>
          <button class="danger" type="button" :disabled="!canDelete || projectDeleteBusy" @click="deleteSelection">Delete Selected</button>
        </div>
      </div>

      <p id="projectFormStatus" class="form-status" :class="projectFormTone">{{ projectFormStatus }}</p>

      <table class="admin-table" aria-label="Projects">
        <thead>
          <tr>
            <th class="selection-cell">Select</th>
            <th>Name</th>
            <th>Path</th>
            <th>Description</th>
            <th>Managed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="project in config.projects"
            :key="project.id"
            :class="{ selected: selectedProjectIds.includes(project.id) }"
          >
            <td class="selection-cell">
              <label class="row-check">
                <input v-model="selectedProjectIds" type="checkbox" :value="project.id" :aria-label="`Select ${project.name}`" />
              </label>
            </td>
            <td>
              <strong>{{ project.name }}</strong>
            </td>
            <td class="path-cell">{{ project.path }}</td>
            <td>{{ project.description || "No description" }}</td>
            <td>{{ project.managed ? "Yes" : "No" }}</td>
            <td class="row-actions">
              <button type="button" @click="inspectProject(project)">Edit</button>
            </td>
          </tr>
        </tbody>
      </table>

      <dl v-if="selectedProject" class="selection-summary">
        <div>
          <dt>Selected Path</dt>
          <dd id="projectPath">{{ selectedProject.path }}</dd>
        </div>
        <div>
          <dt>Selected Description</dt>
          <dd id="projectDescription">{{ selectedProject.description || "No description" }}</dd>
        </div>
      </dl>
    </div>

    <aside v-if="drawerMode" class="admin-drawer" aria-label="Project editor">
      <div class="drawer-header">
        <div>
          <h3>{{ drawerMode === "create" ? "Add Project" : "Project Details" }}</h3>
          <p>{{ drawerMode === "create" ? "Register a local project for Tycho." : "Project metadata is shown for review." }}</p>
        </div>
        <button class="link-button" type="button" @click="closeDrawer">Close</button>
      </div>

      <form id="projectForm" class="project-form" @submit.prevent="emit('submit-project-form')">
        <label>
          <span>Name</span>
          <input v-model="projectForm.name" name="name" type="text" autocomplete="off" :readonly="drawerMode === 'edit'" required />
        </label>
        <label>
          <span>Local Path</span>
          <input v-model="projectForm.path" name="path" type="text" autocomplete="off" :readonly="drawerMode === 'edit'" required />
        </label>
        <label>
          <span>Description</span>
          <textarea v-model="projectForm.description" name="description" rows="4" :readonly="drawerMode === 'edit'"></textarea>
        </label>
        <button v-if="drawerMode === 'create'" type="submit" :disabled="projectFormBusy">Save Project</button>
        <p v-else class="form-status">Project editing is read-only until the server exposes update support.</p>
      </form>

      <dl v-if="activeDrawerProject" class="drawer-details">
        <div>
          <dt>Path</dt>
          <dd>{{ activeDrawerProject.path }}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{{ activeDrawerProject.description || "No description" }}</dd>
        </div>
      </dl>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ProjectConfig, PublicRuntimeConfig } from "../client-types";

const props = defineProps<{
  config: PublicRuntimeConfig;
  projectForm: { name: string; path: string; description: string };
  selectedProjectId: string;
  selectedProject?: ProjectConfig;
  projectFormStatus: string;
  projectFormTone: string;
  projectFormBusy: boolean;
  projectDeleteBusy: boolean;
}>();

const emit = defineEmits<{
  "submit-project-form": [];
  "delete-projects": [projectIds: string[]];
  "persist-selected-project": [];
  "update:selectedProjectId": [projectId: string];
}>();

const selectedProjectIds = ref<string[]>([]);
const drawerMode = ref<"create" | "edit" | null>(null);
const drawerProjectId = ref("");

const selectedProjects = computed(() => props.config.projects.filter((project) => selectedProjectIds.value.includes(project.id)));
const canEdit = computed(() => selectedProjects.value.length === 1);
const canDelete = computed(() => selectedProjects.value.some((project) => project.managed));
const activeDrawerProject = computed(() => props.config.projects.find((project) => project.id === drawerProjectId.value));

watch(
  () => props.config.projects.map((project) => project.id),
  (projectIds) => {
    selectedProjectIds.value = selectedProjectIds.value.filter((projectId) => projectIds.includes(projectId));
  }
);

watch(
  () => props.selectedProjectId,
  (projectId) => {
    if (drawerMode.value === "create" && projectId) {
      drawerProjectId.value = projectId;
    }
  }
);

watch(
  () => props.projectFormStatus,
  (status) => {
    if (status === "Project added" || status === "Project deleted" || status === "Projects deleted") {
      drawerMode.value = null;
    }
  }
);

function openCreateDrawer(): void {
  props.projectForm.name = "";
  props.projectForm.path = "";
  props.projectForm.description = "";
  drawerProjectId.value = "";
  drawerMode.value = "create";
}

function openEditDrawer(): void {
  const project = selectedProjects.value[0];
  if (project) {
    inspectProject(project);
  }
}

function inspectProject(project: ProjectConfig): void {
  selectedProjectIds.value = [project.id];
  emit("update:selectedProjectId", project.id);
  props.projectForm.name = project.name;
  props.projectForm.path = project.path;
  props.projectForm.description = project.description || "";
  drawerProjectId.value = project.id;
  drawerMode.value = "edit";
}

function closeDrawer(): void {
  drawerMode.value = null;
}

function deleteSelection(): void {
  emit("delete-projects", selectedProjects.value.filter((project) => project.managed).map((project) => project.id));
}
</script>
