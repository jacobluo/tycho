<template>
  <div v-if="open" class="modal-backdrop">
    <section class="modal-panel confirm-session-close" role="dialog" aria-modal="true" aria-labelledby="closeSessionTitle">
      <div class="modal-header">
        <div>
          <h2 id="closeSessionTitle">Close Session</h2>
          <p>{{ sessionTitle }}</p>
        </div>
      </div>
      <p class="confirm-dialog-message">Close this server-side TUI session?</p>
      <div class="modal-actions">
        <button class="link-button" type="button" @click="emit('close')">Cancel</button>
        <button class="danger" type="button" @click="emit('confirm')">Close Session</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
  sessionTitle: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>
