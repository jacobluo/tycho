<template>
  <main class="admin-content">
    <div class="section-heading">
      <h2>Project Management</h2>
      <p>Add local projects to Tycho and remove managed entries when they are no longer needed.</p>
    </div>
    <div class="management-grid">
      <form id="projectForm" class="project-form admin-card" @submit.prevent="emit('submit-project-form')">
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
        <label class="project-select-wrap">
          <span>Project</span>
          <select
            id="projectSelect"
            :value="selectedProjectId"
            class="project-select"
            @change="emit('update:selectedProjectId', ($event.target as HTMLSelectElement).value)"
            @blur="emit('persist-selected-project')"
          >
            <option v-for="project in config.projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
        </label>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{{ selectedProject?.name || "No project" }}</dd>
          </div>
          <div>
            <dt>Path</dt>
            <dd id="projectPath">{{ selectedProject?.path || "No projects assigned" }}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd id="projectDescription">{{ selectedProject?.description || "No description" }}</dd>
          </div>
        </dl>
        <button
          id="deleteProject"
          class="danger"
          type="button"
          :disabled="!selectedProject?.managed || projectDeleteBusy"
          @click="emit('delete-selected-project')"
        >
          Delete Project
        </button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { ProjectConfig, PublicRuntimeConfig } from "../client-types";

defineProps<{
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
  "delete-selected-project": [];
  "persist-selected-project": [];
  "update:selectedProjectId": [projectId: string];
}>();
</script>
