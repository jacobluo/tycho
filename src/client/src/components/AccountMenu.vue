<template>
  <div ref="menuRoot" class="account-menu-wrap">
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
import { computed, onMounted, onUnmounted, ref } from "vue";
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
const menuRoot = ref<HTMLElement | null>(null);
const roleLabel = computed(() => props.currentUser.role === "admin" ? "管理员" : "普通用户");

function closeMenu(): void {
  menuOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!menuOpen.value || !menuRoot.value) {
    return;
  }
  if (event.target instanceof Node && menuRoot.value.contains(event.target)) {
    return;
  }
  closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeMenu();
  }
}

function emitAndClose(event: "change-password" | "admin" | "logout"): void {
  closeMenu();
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

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>
