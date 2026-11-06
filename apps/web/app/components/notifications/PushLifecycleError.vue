<script setup lang="ts">
const { error, retry } = usePush()
const busy = ref(false)
async function check() {
  if (busy.value) return
  busy.value = true
  try { await retry() }
  finally { busy.value = false }
}
</script>

<template>
  <aside v-if="error" role="alert" class="push-error">
    <div><strong>Проверьте пуши этого устройства</strong><p>{{ error }}</p></div>
    <button type="button" class="ui-button" :disabled="busy" @click="check">{{ busy ? 'Проверка…' : 'Повторить проверку пушей' }}</button>
  </aside>
</template>

<style scoped>
.push-error { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-4); padding: var(--ui-space-4) clamp(16px, 3vw, 32px); border-bottom: 1px solid var(--ui-danger); color: var(--ui-text); background: var(--ui-surface); overflow-wrap: anywhere; }
.push-error > div { flex: 1 1 24rem; min-width: 0; }
strong { color: var(--ui-danger); font-weight: 600; }
p { margin: var(--ui-space-2) 0 0; color: var(--ui-text-muted); font-size: .875rem; }
</style>
