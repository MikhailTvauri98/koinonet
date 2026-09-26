<script setup lang="ts">
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
    <p>Нет связи с сервером.</p>
    <button type="button" data-test="retry-connection" :disabled="retrying" @click="retry">
      {{ retrying ? 'Проверяем…' : 'Повторить' }}
    </button>
  </div>
  <slot v-if="!blocking" />
</template>

<style scoped>
.connection-lost {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #fbeaea;
  color: #7a1c1c;
}
.connection-lost p { margin: 0; }
.connection-lost--blocking {
  position: fixed;
  inset: 0;
  z-index: 10;
  flex-direction: column;
  justify-content: center;
  background: #fff;
  color: #202b3a;
  font-size: 1.125rem;
}
button { font: inherit; padding: 0.55rem 0.9rem; border: 1px solid #8b96a6; border-radius: 0.3rem; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
</style>
