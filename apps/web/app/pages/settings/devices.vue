<script setup lang="ts">
import type { components } from '~~/types/api'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { fetchChurchTimezone } from '~/composables/useChurchTimezone'
import { apiErrorMessage } from '~/utils/apiError'

// «Устройства»: список сессий, любую кроме текущей можно завершить —
// сервер и так отказал бы (SessionController::destroy), но интерфейс не
// должен предлагать действие, которое заведомо отклонят (бриф задачи 30,
// CONTEXT.md "Устройство").
type Session = components['schemas']['SessionResource']

const api = useApi()

const sessions = ref<Session[]>([])
const { formatDateTime } = useChurchDate()
const loading = ref(true)
const loadError = ref('')
const busyId = ref<string | null>(null)
const busyAll = ref(false)
const actionError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [sessionsResponse] = await Promise.all([
      api.get<{ data: Session[] }>('/auth/sessions'),
      fetchChurchTimezone(),
    ])
    sessions.value = sessionsResponse.data
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Не удалось загрузить список устройств. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}

function formatLastActivity(iso: string | null) {
  return iso ? formatDateTime(iso) : '—'
}

async function end(session: Session) {
  if (session.current || busyId.value) return
  busyId.value = session.id
  actionError.value = ''
  try {
    await api.delete(`/auth/sessions/${session.id}`)
    await load()
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Не удалось завершить это устройство. Попробуйте ещё раз.')
  } finally {
    busyId.value = null
  }
}

async function endOthers() {
  if (busyAll.value) return
  busyAll.value = true
  actionError.value = ''
  try {
    await api.post('/auth/sessions/logout-others')
    await load()
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Не удалось завершить остальные устройства. Попробуйте ещё раз.')
  } finally {
    busyAll.value = false
  }
}

await load()
</script>

<template>
  <section class="devices-page">
    <SettingsTabs />
    <h1>Устройства</h1>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="loadError" role="alert">
      {{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <template v-else>
      <button type="button" data-test="logout-others" :disabled="busyAll" @click="endOthers">
        Завершить остальные устройства
      </button>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <ul class="devices-page__list">
        <li v-for="session in sessions" :key="session.id">
          <p>
            {{ session.user_agent ?? 'Неизвестное устройство' }}
            <span v-if="session.current" class="devices-page__current">(текущее устройство)</span>
          </p>
          <p class="devices-page__meta">
            {{ session.ip_address ?? '—' }} · {{ formatLastActivity(session.last_activity) }}
          </p>
          <button
            type="button" :data-test="`end-${session.id}`" :disabled="session.current || busyId === session.id"
            @click="end(session)"
          >
            Завершить
          </button>
        </li>
      </ul>
      <p v-if="!sessions.length">Нет активных устройств.</p>
    </template>
  </section>
</template>

<style scoped>
.devices-page { max-width: 36rem; margin: 0 auto; color: #202b3a; }
.devices-page__list { list-style: none; padding: 0; margin: 1rem 0 0; }
.devices-page__list li { padding: 0.85rem 0; border-bottom: 1px solid #dfe4ea; }
.devices-page__meta { color: #4b5563; }
.devices-page__current { color: #234e79; font-weight: 600; }
button { font: inherit; padding: 0.5rem 0.9rem; border: 1px solid #8b96a6; border-radius: 0.3rem; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
[role='alert'] { color: #a32020; }
</style>
