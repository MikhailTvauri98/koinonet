<script setup lang="ts">
const { state, failures, retry } = useRealtimeStatus()
</script>

<template>
  <div v-if="state !== 'online'" class="connection-status" role="status">
    <span>Нет связи. Переподключаемся…</span>
    <button v-if="failures >= 3" type="button" class="ui-button connection-status__retry" @click="retry()">Повторить</button>
  </div>
</template>

<style scoped>
.connection-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
  padding: var(--ui-space-2) var(--ui-space-4);
  color: var(--ui-text);
  background: var(--ui-surface-muted, var(--ui-surface));
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  font-size: 0.875rem;
}
.connection-status span { flex: 1 1 12rem; }
</style>
