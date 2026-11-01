<script setup lang="ts">
import LoadingState from '~/components/ui/LoadingState.vue'
// «Нет связи с сервером»: сервер не ответил на `/auth/me` (сеть, 5xx при
// выкладке). Сессию при этом никто не сбрасывает — сброс только по 401
// (stores/auth.ts). Два случая:
// - первая проверка после загрузки не завершилась: неизвестно, кто вошёл,
//   поэтому экраны за входом не показываются, а на вход не ведут;
// - обновление прав посреди работы (после 403) не получило ответа: экран
//   остаётся, сверху — предупреждение с повтором.
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const retrying = ref(false)

const blocking = computed(() => auth.connectionLost && !auth.initialized)

async function retry() {
  if (retrying.value) return
  retrying.value = true
  try {
    if (auth.initialized) {
      await auth.fetchMe()
    } else {
      // Повтор первой проверки — через тот же middleware, что и при загрузке
      // (auth.global.ts): он спросит сервер и сам решит, вести ли на вход.
      await router.replace({ path: route.path, query: route.query, hash: route.hash, force: true })
    }
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <div v-if="auth.connectionLost" role="alert" class="connection-lost" :class="{ 'connection-lost--blocking': blocking }">
    <div><p class="connection-lost__title">Нет связи с сервером.</p><p>{{ blocking ? 'Не удалось проверить аккаунт. Проверьте подключение и повторите попытку.' : 'Не удалось обновить права. Проверьте подключение и повторите проверку.' }}</p></div>
    <button type="button" data-test="retry-connection" :disabled="retrying" @click="retry">
      {{ retrying ? 'Проверяем…' : 'Повторить' }}
    </button>
    <LoadingState v-if="retrying" label="Проверяем связь с сервером…" />
  </div>
  <slot v-if="!blocking" />
</template>

<style scoped>
.connection-lost { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); padding: var(--ui-space-4); background: var(--ui-surface-muted); color: var(--ui-danger); border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
.connection-lost p { margin: 0; }
.connection-lost__title { font-weight: 650; }
.connection-lost--blocking { min-height: 100vh; min-height: 100dvh; flex-direction: column; justify-content: center; align-items: stretch; padding: var(--ui-space-6); text-align: center; background: var(--ui-canvas); color: var(--ui-text); }
.connection-lost--blocking > * { width: 100%; max-width: 36rem; margin-inline: auto; }
.connection-lost--blocking button { width: auto; }
button { max-width: 100%; }
</style>
