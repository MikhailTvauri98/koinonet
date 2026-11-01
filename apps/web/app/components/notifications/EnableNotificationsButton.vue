<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'

const { supported, permission, subscribed, subscribe } = usePush()
const platform = usePlatform()
const busy = ref(false)
const error = ref('')

async function enable() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await subscribe() }
  catch (failure) { error.value = apiErrorMessage(failure, 'Не удалось включить уведомления. Попробуйте ещё раз.') }
  finally { busy.value = false }
}
</script>

<template>
  <aside class="enable-notifications" aria-label="Пуши на этом устройстве">
    <p v-if="platform.isIos && !platform.isStandalone">Чтобы получать уведомления, установите приложение на экран «Домой»: откройте его в Safari, нажмите «Поделиться» → На экран «Домой». Затем откройте приложение с домашнего экрана.</p>
    <p v-else-if="!supported">Этот браузер не поддерживает пуши. Уведомления доступны в центре уведомлений.</p>
    <p v-else-if="permission === 'denied'">Уведомления запрещены в настройках устройства или браузера. Разрешите их для этого приложения.</p>
    <p v-else-if="subscribed" role="status">Уведомления включены на этом устройстве.</p>
    <button v-else type="button" data-test="enable-push" :disabled="busy" @click="enable">{{ busy ? 'Включение…' : 'Включить уведомления' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </aside>
</template>

<style scoped>
.enable-notifications { margin: 1rem 0; padding: min(0.75rem, 12px); background: #edf1f6; border-radius: 0.3rem; }
p { margin: 0; }
button { font: inherit; padding: 0.5rem min(0.9rem, 14px); border: 1px solid #8b96a6; border-radius: 0.3rem; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; margin-top: 0.5rem; }
</style>
