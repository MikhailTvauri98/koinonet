<script setup lang="ts">
import type { components } from '~~/types/api'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

type Settings = components['schemas']['SettingsResource']

// `GET /settings` отдаёт `phone_region` только носителю `settings.manage`
// (SettingsResource.php, задача 30) — этот экран и есть тот носитель, так
// что поле здесь всегда должно быть в ответе; отсутствие трактуем как сбой
// загрузки, а не как «поле недоступно».
const api = useApi()
const { can } = useCan()
const canManage = computed(() => can('settings.manage'))

const churchName = ref('')
const timezone = ref('')
const phoneRegion = ref('')

const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const savedNotice = ref(false)
const saveError = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

function applySettings(data: Settings) {
  churchName.value = data.church_name
  timezone.value = data.timezone
  phoneRegion.value = data.phone_region ?? ''
}

async function load() {
  if (!canManage.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.get<{ data: Settings }>('/settings')
    applySettings(response.data)
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Не удалось загрузить настройки. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (saving.value || !canManage.value) return
  saving.value = true
  savedNotice.value = false
  saveError.value = ''
  fieldErrors.value = {}
  try {
    const response = await api.put<{ data: Settings }>('/settings', {
      church_name: churchName.value.trim(),
      timezone: timezone.value.trim(),
      phone_region: phoneRegion.value.trim().toUpperCase(),
    })
    applySettings(response.data)
    savedNotice.value = true
  } catch (error) {
    saveError.value = apiErrorMessage(error, 'Не удалось сохранить настройки. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally {
    saving.value = false
  }
}

// Право снимается посреди сессии тем же приёмом, что и в других
// разделах администрирования (admin/roles.vue): canManage читается заново
// при каждом пересчёте (useCan.ts), watch реагирует на его смену.
watch(canManage, (allowed) => { if (allowed) void load() })

if (canManage.value) await load()
</script>

<template>
  <section class="admin-settings">
    <h1>Настройки церкви</h1>
    <p v-if="!canManage" role="alert">Нет права на управление настройками церкви.</p>
    <template v-else>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="loadError" role="alert">
        {{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button>
      </p>
      <form v-else @submit.prevent="submit">
        <label>
          Название церкви
          <input v-model="churchName" data-test="church-name" type="text" maxlength="100" required>
          <span v-if="fieldErrors.church_name" role="alert">{{ fieldErrors.church_name.join(' ') }}</span>
        </label>
        <label>
          Часовой пояс
          <input v-model="timezone" data-test="timezone" type="text" required placeholder="Europe/Moscow">
          <span v-if="fieldErrors.timezone" role="alert">{{ fieldErrors.timezone.join(' ') }}</span>
        </label>
        <label>
          Регион телефонов
          <input v-model="phoneRegion" data-test="phone-region" type="text" maxlength="2" required placeholder="RU">
          <span v-if="fieldErrors.phone_region" role="alert">{{ fieldErrors.phone_region.join(' ') }}</span>
        </label>
        <p v-if="saveError" role="alert">{{ saveError }}</p>
        <p v-if="savedNotice" role="status">Сохранено.</p>
        <button type="submit" data-test="save-settings" :disabled="saving">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.admin-settings { max-width: 28rem; margin: 0 auto; color: #202b3a; }
form { display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; }
input, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; align-self: flex-start; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
