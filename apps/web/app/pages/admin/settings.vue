<script setup lang="ts">
import FormSection from '~/components/ui/FormSection.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import type { components } from '~~/types/api'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

type Settings = components['schemas']['SettingsResource']

// `GET /settings` отдаёт `phone_region` только носителю `settings.manage`
// (SettingsResource.php, задача 30) — этот экран и есть тот носитель, так
// что поле здесь всегда должно быть в ответе; отсутствие трактуем как сбой
// загрузки, а не как «поле недоступно».
const api = useApi()
const auth = useAuthStore()
let generation = 0
let active = true
const fieldId = useId()
const form = ref<HTMLFormElement>()
const valid = (version: number) => active && version === generation && canManage.value
onBeforeUnmount(() => { active = false; generation++ })
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
  useSettingsStore().apply(data)
  churchName.value = data.church_name
  timezone.value = data.timezone
  phoneRegion.value = data.phone_region ?? ''
}

async function load() {
  if (!canManage.value) return
  const version = ++generation
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.get<{ data: Settings }>('/settings')
    if (!valid(version)) return
    applySettings(response.data)
  } catch (error) {
    if (!valid(version)) return
    loadError.value = apiErrorMessage(error, 'Не удалось загрузить настройки. Попробуйте ещё раз.')
  } finally {
    if (valid(version)) loading.value = false
  }
}

async function submit() {
  if (saving.value || !canManage.value) return
  const version = generation
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
    if (!valid(version)) return
    applySettings(response.data)
    savedNotice.value = true
  } catch (error) {
    if (!valid(version)) return
    saveError.value = apiErrorMessage(error, 'Не удалось сохранить настройки. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)

  } finally {
    if (valid(version)) {
      saving.value = false
      await nextTick()
      if (valid(version) && Object.keys(fieldErrors.value).length) form.value?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus()
    }
  }
}

watch([() => auth.sessionVersion, canManage], () => {
  generation++
  churchName.value = ''; timezone.value = ''; phoneRegion.value = ''
  saving.value = false; loading.value = false; savedNotice.value = false
  saveError.value = ''; loadError.value = ''; fieldErrors.value = {}
  if (canManage.value) void load()
}, { flush: 'sync' })

if (canManage.value) await load()
</script>

<template>
  <section class="admin-settings">
    <PageHeader title="Настройки церкви" description="Название и региональные параметры для всей церкви." />
    <p v-if="!canManage" role="alert">Нет права на управление настройками церкви.</p>
    <template v-else>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="loadError" role="alert">{{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button></p>
      <form v-else ref="form" class="ui-form" @submit.prevent="submit">
        <div class="ui-form-grid">
          <FormSection title="О церкви">
            <div class="ui-field">
              <label :for="`${fieldId}-name`">Название церкви</label>
              <input :id="`${fieldId}-name`" v-model="churchName" data-test="church-name" type="text" maxlength="100" required :disabled="saving" :aria-invalid="!!fieldErrors.church_name" :aria-describedby="fieldErrors.church_name ? `${fieldId}-name-error` : undefined">
              <p v-if="fieldErrors.church_name" :id="`${fieldId}-name-error`" class="ui-field-error" role="alert">{{ fieldErrors.church_name.join(' ') }}</p>
            </div>
          </FormSection>
          <FormSection title="Региональные настройки" description="Даты и время показываются в часовом поясе церкви. Регион используется для распознавания телефонов.">
            <div class="ui-field">
              <label :for="`${fieldId}-timezone`">Часовой пояс</label>
              <input :id="`${fieldId}-timezone`" v-model="timezone" data-test="timezone" type="text" required placeholder="Europe/Moscow" :disabled="saving" :aria-invalid="!!fieldErrors.timezone" :aria-describedby="fieldErrors.timezone ? `${fieldId}-timezone-error` : undefined">
              <p v-if="fieldErrors.timezone" :id="`${fieldId}-timezone-error`" class="ui-field-error" role="alert">{{ fieldErrors.timezone.join(' ') }}</p>
            </div>
            <div class="ui-field">
              <label :for="`${fieldId}-region`">Регион телефонов</label>
              <input :id="`${fieldId}-region`" v-model="phoneRegion" data-test="phone-region" class="admin-settings__region" type="text" maxlength="2" required placeholder="RU" :disabled="saving" :aria-invalid="!!fieldErrors.phone_region" :aria-describedby="fieldErrors.phone_region ? `${fieldId}-region-error` : undefined">
              <p v-if="fieldErrors.phone_region" :id="`${fieldId}-region-error`" class="ui-field-error" role="alert">{{ fieldErrors.phone_region.join(' ') }}</p>
            </div>
          </FormSection>
        </div>
        <p v-if="saveError" role="alert">{{ saveError }}</p>
        <p v-if="savedNotice" role="status">Сохранено.</p>
        <div class="ui-form-actions"><button type="submit" class="ui-button ui-button--primary" data-test="save-settings" :disabled="saving">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button></div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.admin-settings { min-width: 0; color: var(--ui-text); overflow-wrap: anywhere; }
.admin-settings__region { max-width: 8rem; }
input { scroll-margin-block: 6rem; }
</style>
