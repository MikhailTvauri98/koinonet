<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'

defineProps<{ heading?: boolean }>()

const { supported, permission, subscribed, subscribe } = usePush()
const platform = usePlatform()
const auth = useAuthStore()
const busy = ref(false)
const error = ref('')

let active = true
onBeforeUnmount(() => { active = false })
watch(() => auth.sessionVersion, () => { busy.value = false; error.value = '' })

async function enable() {
  if (busy.value) return
  const session = auth.sessionVersion
  const current = () => active && session === auth.sessionVersion
  busy.value = true
  error.value = ''
  try { await subscribe() }
  catch (failure) { if (current()) error.value = apiErrorMessage(failure, 'Не удалось включить уведомления. Попробуйте ещё раз.') }
  finally { if (current()) busy.value = false }
}
</script>

<template>
  <aside class="enable-notifications" aria-label="Пуши на этом устройстве">
    <h2 v-if="heading">Пуши на этом устройстве</h2>
    <p v-if="platform.isIos && !platform.isStandalone">Чтобы получать уведомления, установите приложение на экран «Домой»: откройте его в Safari, нажмите «Поделиться» → На экран «Домой». Затем откройте приложение с домашнего экрана.</p>
    <p v-else-if="!supported">Этот браузер не поддерживает пуши. Уведомления доступны в центре уведомлений.</p>
    <p v-else-if="permission === 'denied'">Уведомления запрещены в настройках устройства или браузера. Разрешите их для этого приложения.</p>
    <p v-else-if="subscribed" role="status">Уведомления включены на этом устройстве.</p>
    <template v-else>
      <p>Получайте уведомления, даже когда приложение закрыто.</p>
      <button class="ui-button" type="button" data-test="enable-push" :disabled="busy" @click="enable">{{ busy ? 'Включение…' : 'Включить уведомления' }}</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </aside>
</template>

<style scoped>
.enable-notifications { display: grid; gap: var(--ui-space-2); min-width: 0; padding-block: 0 var(--ui-space-4); border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }
h2 { margin: 0; font-size: 1rem; }
p { margin: 0; color: var(--ui-text-muted); font-size: .875rem; }
button { justify-self: start; margin-top: var(--ui-space-2); }
[role='alert'] { color: var(--ui-danger); }
</style>
