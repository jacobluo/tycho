<template>
  <div v-if="open" class="modal-backdrop">
    <form class="modal-panel session-dialog" @submit.prevent="emit('submit')">
      <div class="modal-header">
        <div>
          <h2>Name Session</h2>
          <p>{{ agentName }}</p>
        </div>
        <button class="link-button" type="button" @click="emit('close')">Cancel</button>
      </div>
      <label>
        <span>Session Name</span>
        <input ref="nameInput" v-model="form.name" autocomplete="off" required />
      </label>
      <button type="submit" :disabled="form.name.trim().length === 0">Start Session</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  agentName: string;
  form: { name: string };
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
}>();

const nameInput = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (open) {
      void nextTick(() => nameInput.value?.focus());
    }
  }
);
</script>
