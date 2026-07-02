<template>
  <section class="admin-shell">
    <nav class="admin-sidebar" aria-label="Admin Management">
      <RouterLink to="/admin/projects">Project Management</RouterLink>
      <RouterLink to="/admin/users">User Management</RouterLink>
    </nav>
    <RouterView v-slot="{ Component }">
      <component
        :is="Component"
        v-bind="$props"
        @submit-project-form="emit('submit-project-form')"
        @delete-selected-project="emit('delete-selected-project')"
        @persist-selected-project="emit('persist-selected-project')"
        @create-new-user="emit('create-new-user')"
        @save-user="emit('save-user', $event)"
        @toggle-user-status="emit('toggle-user-status', $event)"
        @delete-user="emit('delete-user', $event)"
        @save-user-projects="emit('save-user-projects', $event)"
      />
    </RouterView>
  </section>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import type {
  PublicRuntimeConfig,
  ProjectConfig,
  PublicUser,
  UserEditState,
  UserRole
} from "../client-types";

defineProps<{
  config: PublicRuntimeConfig;
  users: PublicUser[];
  userEdits: Record<string, UserEditState>;
  projectForm: { name: string; path: string; description: string };
  newUserForm: { username: string; password: string; role: UserRole };
  selectedProjectId: string;
  selectedProject?: ProjectConfig;
  projectFormStatus: string;
  projectFormTone: string;
  userFormStatus: string;
  userFormTone: string;
  projectFormBusy: boolean;
  projectDeleteBusy: boolean;
  userFormBusy: boolean;
}>();

const emit = defineEmits<{
  "submit-project-form": [];
  "delete-selected-project": [];
  "persist-selected-project": [];
  "create-new-user": [];
  "save-user": [user: PublicUser];
  "toggle-user-status": [user: PublicUser];
  "delete-user": [user: PublicUser];
  "save-user-projects": [user: PublicUser];
}>();
</script>
