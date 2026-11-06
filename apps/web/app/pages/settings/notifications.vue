<script setup lang="ts">
import type { components } from '~~/types/api'
import FormSection from '~/components/ui/FormSection.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import EnableNotificationsButton from '~/components/notifications/EnableNotificationsButton.vue'
import { apiErrorMessage } from '~/utils/apiError'

type Category = components['schemas']['NotificationSettingResource']
const api = useApi()
const auth = useAuthStore()
const categories = ref<Category[]>([])
const loading = ref(false)
const busy = ref<string[]>([])
const loadError = ref('')
const saveError = ref('')
let generation = 0

async function load() {
  const version = ++generation
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.get<{ data: Category[] }>('/notification-settings')
    if (version === generation) categories.value = response.data
  } catch (error) {
    if (version === generation) loadError.value = apiErrorMessage(error, 'Не удалось загрузить настройки уведомлений. Попробуйте ещё раз.')
  } finally {
    if (version === generation) loading.value = false
  }
}

async function toggle(category: Category, event: Event) {
  const previous = category.enabled
  category.enabled = (event.target as HTMLInputElement).checked
  const version = generation
  busy.value.push(category.category)
  saveError.value = ''
  try {
    await api.put('/notification-settings', { settings: { [category.category]: category.enabled } })
  } catch (error) {
    if (version === generation) {
      category.enabled = previous
      saveError.value = apiErrorMessage(error, 'Не удалось сохранить настройки уведомлений. Попробуйте ещё раз.')
    }
  } finally {
    if (version === generation) busy.value = busy.value.filter(key => key !== category.category)
  }
}

watch(() => auth.user?.id, () => {
  generation++
  categories.value = []
  busy.value = []
  saveError.value = ''
  if (auth.user) void load()
})
onBeforeUnmount(() => { generation++ })
await load()
</script>

<template>
  <section class="notification-settings">
    <SettingsTabs />
    <h1>Уведомления</h1>
    <FormSection title="Пуши на этом устройстве">
      <EnableNotificationsButton />
    </FormSection>
    <FormSection title="Категории уведомлений">
    <p>Выберите категории пушей. Объявления, назначения и напоминания сохраняются в центре уведомлений при выключенной категории.</p>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="loadError" role="alert">{{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button></p>
    <template v-else>
      <label v-for="category in categories" :key="category.category">
        <input type="checkbox" :data-test="`category-${category.category}`" :checked="category.enabled" :disabled="busy.includes(category.category)" @change="toggle(category, $event)">
        {{ category.label }}
      </label>
      <p v-if="saveError" role="alert">{{ saveError }}</p>
    </template>
    </FormSection>
  </section>
</template>

<style scoped>
.notification-settings { max-width: 56rem; min-width: 0; color: var(--ui-text); overflow-wrap: anywhere; }
.notification-settings > :deep(.ui-form-section) { margin-bottom: var(--ui-space-6); }
label { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: min(var(--ui-space-2), 8px); padding: min(var(--ui-space-2), 8px); margin-block: var(--ui-space-3); min-height: var(--ui-control-height); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); background: var(--ui-surface); cursor: pointer; }
input { width: min(1.125rem, 24px); height: min(1.125rem, 24px); margin: .3em 0 0; }
button { max-width: 100%; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
