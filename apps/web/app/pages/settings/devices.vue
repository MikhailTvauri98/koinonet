<script setup lang="ts">
import type { components } from '~~/types/api'
import { deviceLabel } from '~/utils/deviceLabel'
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
      <button type="button" class="danger" data-test="logout-others" :disabled="busyAll" @click="endOthers">
        Завершить остальные устройства
      </button>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
      <ul class="devices-page__list">
        <li v-for="session in sessions" :key="session.id">
          <p>
            <strong>{{ deviceLabel(session.user_agent) }}</strong>
            <span v-if="session.current" class="devices-page__current">(текущее устройство)</span>
          </p>
          <details v-if="session.user_agent">
            <summary>Сведения о программе</summary>
            <p class="devices-page__agent">{{ session.user_agent }}</p>
          </details>
          <p class="devices-page__meta">
            {{ session.ip_address ?? '—' }} · {{ formatLastActivity(session.last_activity) }}
          </p>
          <button
            type="button" class="danger" :data-test="`end-${session.id}`" :disabled="session.current || busyId === session.id"
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
.devices-page { max-width: 40rem; min-width: 0; margin: 0 auto; color: var(--ui-text); overflow-wrap: anywhere; }
.devices-page__list { display: grid; gap: var(--ui-space-4); list-style: none; padding: 0; margin: var(--ui-space-6) 0 0; }
.devices-page__list li { min-width: 0; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-6), 20px); box-shadow: var(--ui-shadow); }
.devices-page__list li > p:first-child { margin-top: 0; }
.devices-page__meta, .devices-page__agent { color: var(--ui-text-muted); overflow-wrap: anywhere; }
.devices-page__current { display: block; color: var(--ui-accent); font-weight: 600; }
summary { cursor: pointer; color: var(--ui-accent); min-height: var(--ui-control-height); padding-block: var(--ui-space-2); }
button { max-width: 100%; padding-inline: min(.875rem, 14px); overflow-wrap: anywhere; }
.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
[role='alert'], .error { color: var(--ui-danger); }
</style>
