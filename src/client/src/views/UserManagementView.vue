<template>
  <main class="admin-content">
    <div class="section-heading">
      <h2>User Management</h2>
      <p>Review users first, then create, edit, enable, disable, or remove accounts from the toolbar.</p>
    </div>

    <div class="admin-list-shell">
      <div class="admin-toolbar" aria-label="User actions">
        <div>
          <strong>{{ users.length }} users</strong>
          <span>{{ selectedUsers.length }} selected</span>
        </div>
        <div class="admin-toolbar-actions">
          <button type="button" @click="openCreateDrawer">Add User</button>
          <button type="button" :disabled="!canEdit" @click="openEditDrawer">Edit User</button>
          <button type="button" :disabled="selectedUsers.length === 0" @click="toggleSelection">Enable/Disable</button>
          <button class="danger" type="button" :disabled="selectedUsers.length === 0" @click="emit('delete-users', selectedUsers)">Delete Selected</button>
        </div>
      </div>

      <p v-if="userFormStatus" id="userFormStatus" class="form-status" :class="userFormTone">{{ userFormStatus }}</p>

      <table class="admin-table" aria-label="Users">
        <thead>
          <tr>
            <th class="selection-cell">Select</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Projects</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" :class="{ selected: selectedUserIds.includes(user.id) }" :data-user-row="user.username">
            <td class="selection-cell">
              <label class="row-check">
                <input v-model="selectedUserIds" type="checkbox" :value="user.id" :aria-label="`Select ${user.username}`" />
              </label>
            </td>
            <td><strong>{{ user.username }}</strong></td>
            <td>{{ user.role }}</td>
            <td>{{ user.status }}</td>
            <td>{{ projectSummary(user) }}</td>
            <td>{{ formatDate(user.updatedAt) }}</td>
            <td class="row-actions">
              <button type="button" @click="inspectUser(user)">Edit</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <aside v-if="drawerMode" class="admin-drawer" aria-label="User editor">
      <div class="drawer-header">
        <div>
          <h3>{{ drawerMode === "create" ? "Add User" : "Edit User" }}</h3>
          <p>{{ drawerMode === "create" ? "Create a Tycho account." : "Update account access and project assignment." }}</p>
        </div>
        <button class="link-button" type="button" @click="closeDrawer">Close</button>
      </div>

      <form v-if="drawerMode === 'create'" class="project-form" @submit.prevent="emit('create-new-user')">
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
        <button type="submit" :disabled="userFormBusy">Save User</button>
        <p class="form-status" :class="userFormTone">{{ userFormStatus }}</p>
      </form>

      <div v-else-if="activeUser" class="project-form">
        <label>
          <span>Role</span>
          <select v-model="userEdits[activeUser.id].role" class="project-select">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>
          <span>Password</span>
          <input v-model="userEdits[activeUser.id].password" type="password" placeholder="New password" />
        </label>
        <div class="user-actions">
          <button type="button" @click="emit('save-user', activeUser)">Save User</button>
          <button type="button" @click="emit('toggle-user-status', activeUser)">{{ activeUser.status === "active" ? "Disable" : "Enable" }}</button>
          <button class="danger" type="button" @click="emit('delete-user', activeUser)">Delete</button>
        </div>
        <fieldset class="assignment-list">
          <legend>Projects</legend>
          <label v-for="project in config.projects" :key="project.id" class="assignment-item">
            <input
              v-model="userEdits[activeUser.id].projectIds"
              type="checkbox"
              :value="project.id"
            />
            <span>{{ project.name }}</span>
          </label>
        </fieldset>
        <button type="button" @click="emit('save-user-projects', activeUser)">Save Projects</button>
        <p class="user-status-message form-status" :class="userEdits[activeUser.id].tone">{{ userEdits[activeUser.id].message }}</p>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PublicRuntimeConfig, PublicUser, UserEditState, UserRole } from "../client-types";

const props = defineProps<{
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
  "delete-users": [users: PublicUser[]];
  "toggle-users-status": [users: PublicUser[]];
}>();

const selectedUserIds = ref<string[]>([]);
const drawerMode = ref<"create" | "edit" | null>(null);
const activeUserId = ref("");

const selectedUsers = computed(() => props.users.filter((user) => selectedUserIds.value.includes(user.id)));
const canEdit = computed(() => selectedUsers.value.length === 1);
const activeUser = computed(() => props.users.find((user) => user.id === activeUserId.value));

watch(
  () => props.users.map((user) => user.id),
  (userIds) => {
    selectedUserIds.value = selectedUserIds.value.filter((userId) => userIds.includes(userId));
  }
);

watch(
  () => props.userFormStatus,
  (status) => {
    if (status === "User created") {
      drawerMode.value = null;
    }
  }
);

function openCreateDrawer(): void {
  props.newUserForm.username = "";
  props.newUserForm.password = "";
  props.newUserForm.role = "user";
  activeUserId.value = "";
  drawerMode.value = "create";
}

function openEditDrawer(): void {
  const user = selectedUsers.value[0];
  if (user) {
    inspectUser(user);
  }
}

function inspectUser(user: PublicUser): void {
  selectedUserIds.value = [user.id];
  activeUserId.value = user.id;
  drawerMode.value = "edit";
}

function closeDrawer(): void {
  drawerMode.value = null;
}

function toggleSelection(): void {
  emit("toggle-users-status", selectedUsers.value);
}

function projectSummary(user: PublicUser): string {
  if (user.projectIds.length === 0) {
    return "No projects";
  }
  return user.projectIds
    .map((projectId) => props.config.projects.find((project) => project.id === projectId)?.name || projectId)
    .join(", ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}
</script>
