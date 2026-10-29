<script setup lang="ts">
const { error, retry } = usePush()
const busy = ref(false)
async function check() {
  busy.value = true
  try { await retry() }
  finally { busy.value = false }
}
</script>

<template>
  <aside v-if="error" role="alert" class="push-error">
    <p>{{ error }}</p>
    <button type="button" :disabled="busy" @click="check">{{ busy ? 'Проверка…' : 'Повторить проверку пушей' }}</button>
  </aside>
</template>

<style scoped>
.push-error { margin: 1rem; padding: 0.75rem; border: 1px solid #a32020; color: #a32020; }
button { font: inherit; }
</style>
