<template>
  <main class="admin-content">
    <div class="section-heading">
      <h2>User Management</h2>
      <p>Create users, change roles and passwords, and assign project access.</p>
    </div>
    <div class="management-grid users-management-grid">
      <form class="project-form admin-card" @submit.prevent="emit('create-new-user')">
        <h3>Create User</h3>
        <label>
          <span>New Username</span>
          <input v-model="newUserForm.username" autocomplete="off" required />
        </label>
        <label>
          <span>New Password</span>
          <input v-model="newUserForm.password" type="password" autocomplete="new-password" required />
        </label>
        <label>
          <span>New Role</span>
          <select v-model="newUserForm.role" class="project-select">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit" :disabled="userFormBusy">Create User</button>
        <p id="userFormStatus" class="form-status" :class="userFormTone">{{ userFormStatus }}</p>
      </form>

      <div class="user-list">
        <article v-for="user in users" :key="user.id" class="user-card" :data-user-row="user.username">
          <div class="user-card-header">
            <strong>{{ user.username }}</strong>
            <span>{{ user.status }}</span>
          </div>
          <label>
            <span>Role</span>
            <select v-model="userEdits[user.id].role" class="project-select">
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            <span>Password</span>
            <input v-model="userEdits[user.id].password" type="password" placeholder="New password" />
          </label>
          <div class="user-actions">
            <button type="button" @click="emit('save-user', user)">Save User</button>
            <button type="button" @click="emit('toggle-user-status', user)">{{ user.status === "active" ? "Disable" : "Enable" }}</button>
            <button class="danger" type="button" @click="emit('delete-user', user)">Delete</button>
          </div>
          <fieldset class="assignment-list">
            <legend>Projects</legend>
            <label v-for="project in config.projects" :key="project.id" class="assignment-item">
              <input
                v-model="userEdits[user.id].projectIds"
                type="checkbox"
                :value="project.id"
              />
              <span>{{ project.name }}</span>
            </label>
          </fieldset>
          <button type="button" @click="emit('save-user-projects', user)">Save Projects</button>
          <p class="user-status-message form-status" :class="userEdits[user.id].tone">{{ userEdits[user.id].message }}</p>
        </article>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { PublicRuntimeConfig, PublicUser, UserEditState, UserRole } from "../client-types";

defineProps<{
  config: PublicRuntimeConfig;
  users: PublicUser[];
  userEdits: Record<string, UserEditState>;
  newUserForm: { username: string; password: string; role: UserRole };
  userFormStatus: string;
  userFormTone: string;
  userFormBusy: boolean;
}>();

const emit = defineEmits<{
  "create-new-user": [];
  "save-user": [user: PublicUser];
  "toggle-user-status": [user: PublicUser];
  "delete-user": [user: PublicUser];
  "save-user-projects": [user: PublicUser];
}>();
</script>
