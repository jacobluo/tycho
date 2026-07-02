<template>
  <div v-if="open" class="modal-backdrop">
    <form class="modal-panel" @submit.prevent="emit('submit')">
      <div class="modal-header">
        <h2>Change Password</h2>
        <button class="link-button" type="button" @click="emit('close')">Close</button>
      </div>
      <label>
        <span>Current Password</span>
        <input v-model="form.currentPassword" type="password" autocomplete="current-password" required />
      </label>
      <label>
        <span>New Password</span>
        <input v-model="form.newPassword" type="password" autocomplete="new-password" required />
      </label>
      <button type="submit" :disabled="busy">Save Password</button>
      <p id="passwordFormStatus" class="form-status" :class="tone">{{ status }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
  busy: boolean;
  status: string;
  tone: string;
  form: { currentPassword: string; newPassword: string };
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
}>();
</script>
