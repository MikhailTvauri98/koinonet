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
const retryError = ref('')
let active = true
onBeforeUnmount(() => { active = false })
watch(() => auth.sessionVersion, () => { retrying.value = false; retryError.value = '' })

const blocking = computed(() => auth.connectionLost && !auth.initialized)

async function retry() {
  if (retrying.value) return
  const session = auth.sessionVersion
  retryError.value = ''
  retrying.value = true
  try {
    if (auth.initialized) {
      await auth.fetchMe()
    } else {
      // Повтор первой проверки — через тот же middleware, что и при загрузке
      // (auth.global.ts): он спросит сервер и сам решит, вести ли на вход.
      await router.replace({ path: route.path, query: route.query, hash: route.hash, force: true })
    }
  } catch {
    if (active && session === auth.sessionVersion) retryError.value = 'Не удалось повторить проверку. Проверьте подключение и попробуйте ещё раз.'
  } finally {
    if (active && session === auth.sessionVersion) retrying.value = false
  }
}
</script>

<template>
  <div v-if="auth.connectionLost" role="alert" class="connection-lost" :class="{ 'connection-lost--blocking': blocking }">
    <div class="connection-lost__message"><p class="connection-lost__title">Нет связи с сервером.</p><p>{{ blocking ? 'Не удалось проверить аккаунт. Проверьте подключение и повторите попытку.' : 'Не удалось обновить права. Проверьте подключение и повторите проверку.' }}</p></div>
    <p v-if="retryError" class="connection-lost__retry-error">{{ retryError }}</p>
    <button type="button" class="ui-button" data-test="retry-connection" :disabled="retrying" @click="retry">
      {{ retrying ? 'Проверяем…' : 'Повторить' }}
    </button>
    <LoadingState v-if="retrying" label="Проверяем связь с сервером…" />
  </div>
  <slot v-if="!blocking" />
</template>

<style scoped>
.connection-lost { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-4); padding: var(--ui-space-4) clamp(16px, 3vw, 32px); background: var(--ui-surface); color: var(--ui-text); border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
.connection-lost p { margin: 0; }
.connection-lost__message { flex: 1 1 24rem; min-width: 0; }
.connection-lost__message > p + p { margin-top: var(--ui-space-2); color: var(--ui-text-muted); font-size: .875rem; }
.connection-lost__title { font-weight: 650; }
.connection-lost__title::before { content: '!'; display: inline-grid; place-items: center; width: 1.5em; height: 1.5em; margin-inline-end: .5em; border: 1px solid var(--ui-danger); border-radius: 50%; color: var(--ui-danger); }
.connection-lost__retry-error { flex-basis: 100%; color: var(--ui-danger); }
.connection-lost--blocking { min-height: 100vh; min-height: 100dvh; flex-direction: column; justify-content: center; align-items: flex-start; padding: var(--ui-space-6) clamp(16px, 3vw, 32px); background: var(--ui-canvas); border: 0; }
.connection-lost--blocking > * { width: 100%; max-width: 36rem; margin-inline: auto; flex: initial; }
.connection-lost--blocking button { width: auto; }
</style>
