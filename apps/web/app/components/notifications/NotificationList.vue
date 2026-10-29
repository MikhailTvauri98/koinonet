<script setup lang="ts">
import type { AppNotification } from '~/stores/notifications'

defineProps<{ items: AppNotification[], disabled?: boolean }>()
defineEmits<{ select: [notification: AppNotification] }>()
const { formatDateTime } = useChurchDate()
</script>

<template>
  <ul class="notification-list">
    <li v-for="item in items" :key="item.id">
      <button type="button" :data-test="`notification-${item.id}`" :class="{ unread: !item.read_at }" :disabled="disabled" @click="$emit('select', item)">
        <strong>{{ item.title }}<span v-if="!item.read_at" class="notification-list__unread"> · Непрочитано</span></strong>
        <span>{{ item.body }}</span>
        <time v-if="item.created_at" :datetime="item.created_at">{{ formatDateTime(item.created_at) }}</time>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.notification-list { list-style: none; padding: 0; margin: 1rem 0; }
button { display: flex; flex-direction: column; gap: 0.4rem; width: 100%; padding: 1rem; border: 0; border-bottom: 1px solid #dfe4ea; background: white; text-align: left; color: inherit; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
button.unread { background: #edf1f6; }
button:disabled { cursor: wait; }
time, .notification-list__unread { color: #4b5563; font-size: 0.9rem; }
</style>
