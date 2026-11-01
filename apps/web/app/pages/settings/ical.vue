<script setup lang="ts">
import type { components } from '~~/types/api'
import UiDialog from '~/components/ui/UiDialog.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { apiErrorMessage } from '~/utils/apiError'
const auth = useAuthStore(), api = useApi()
const url = computed(() => auth.user?.ical_url ?? '')
const confirming = ref(false), rotating = ref(false), feedback = ref(''), errorMessage = ref('')
let generation = 0
async function copy() {
  const version = generation; feedback.value = ''; errorMessage.value = ''
  try {
    await navigator.clipboard.writeText(url.value)
    if (version === generation) feedback.value = 'Ссылка скопирована.'
  } catch { if (version === generation) errorMessage.value = 'Не удалось скопировать ссылку. Выделите её и скопируйте вручную.' }
}
async function rotate() {
  if (rotating.value || !confirming.value || !auth.user) return
  const version = generation, session = auth.sessionVersion, userId = auth.user.id
  rotating.value = true; errorMessage.value = ''; feedback.value = ''
  try {
    const response = await api.post<{ data: components['schemas']['IcalTokenResource'] }>('/me/ical-token/rotate')
    if (session !== auth.sessionVersion || auth.user?.id !== userId) return
    auth.user = { ...auth.user, ical_url: response.data.ical_url }
    if (version !== generation) return
    confirming.value = false; feedback.value = 'Ссылка обновлена. Замените подписку в календаре телефона.'
  } catch (error) { if (version === generation && session === auth.sessionVersion) errorMessage.value = apiErrorMessage(error, 'Не удалось обновить ссылку. Попробуйте ещё раз.') }
  finally { if (version === generation) rotating.value = false }
}
watch(() => auth.sessionVersion, () => { generation++; confirming.value = false; rotating.value = false; feedback.value = ''; errorMessage.value = '' })
onBeforeUnmount(() => { generation++ })
</script>
<template>
  <main class="ical-settings">
    <SettingsTabs />
    <h1>Календарь телефона</h1>
    <p>Добавьте эту ссылку подпиской в календарь телефона. Тогда он будет получать обновления ваших назначений. Обычный импорт файла не обновляется автоматически.</p>
    <template v-if="url">
      <p><a :href="url" data-test="ical-url">{{ url }}</a></p>
      <p>Ссылка открывает ваш личный календарь без входа. Сохраните её для себя.</p>
      <button type="button" data-test="copy" :disabled="rotating" @click="copy">Скопировать ссылку</button>
      <button type="button" data-test="rotate" :disabled="rotating" @click="confirming = true; feedback = ''; errorMessage = ''">Перевыпустить ссылку</button>
    </template>
    <p v-else>Ссылка недоступна. Войдите в аккаунт заново.</p>
    <UiDialog :open="confirming" label="Перевыпуск ссылки календаря" @close="confirming = false">
      <h2>Перевыпустить ссылку?</h2>
      <p>Старая ссылка перестанет работать. После перевыпуска добавьте новую подписку в календарь телефона.</p>
      <button type="button" data-test="confirm-rotate" :disabled="rotating" @click="rotate">{{ rotating ? 'Обновляется…' : 'Подтвердить перевыпуск' }}</button>
      <button type="button" :disabled="rotating" @click="confirming = false">Назад</button>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    </UiDialog>
    <p v-if="feedback" role="status">{{ feedback }}</p><p v-if="errorMessage && !confirming" role="alert">{{ errorMessage }}</p>
  </main>
</template>
<style scoped>.ical-settings { max-width: 40rem; margin: auto; overflow-wrap: anywhere; } button { font: inherit; padding: .6rem; margin: .3rem; } [role='alert'] { color: #a32020; }</style>
