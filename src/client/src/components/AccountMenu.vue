<template>
  <div class="account-menu-wrap">
    <button class="account-menu-trigger" type="button" @click="menuOpen = !menuOpen">
      <span class="account-username">{{ currentUser.username }}</span>
      <span class="account-role-badge">{{ roleLabel }}</span>
    </button>
    <div v-if="menuOpen" class="account-menu" role="menu">
      <button role="menuitem" type="button" @click="emitAndClose('change-password')">Change Password</button>
      <button v-if="isAdmin" role="menuitem" type="button" @click="emitAndClose('admin')">Admin Management</button>
      <button role="menuitem" type="button" @click="emitAndClose('logout')">Log Out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { PublicUser } from "../client-types";

const props = defineProps<{
  currentUser: PublicUser;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  "change-password": [];
  admin: [];
  logout: [];
}>();

const menuOpen = ref(false);
const roleLabel = computed(() => props.currentUser.role === "admin" ? "管理员" : "普通用户");

function emitAndClose(event: "change-password" | "admin" | "logout"): void {
  menuOpen.value = false;
  if (event === "change-password") {
    emit("change-password");
    return;
  }
  if (event === "admin") {
    emit("admin");
    return;
  }
  emit("logout");
}
</script>
