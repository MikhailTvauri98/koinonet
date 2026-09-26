<script setup lang="ts">
import type { components } from '~~/types/api'
import AccessLinkDialog from '~/components/people/AccessLinkDialog.vue'
import type { Person } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{ person: Person }>()
const emit = defineEmits<{ changed: [] }>()
const api = useApi()
const { can } = useCan()
const busy = ref(false)
const errorMessage = ref('')
const confirmDisable = ref(false)
const link = ref<{ url: string, kind: 'invite' | 'password_reset' } | null>(null)
let active = true
onBeforeUnmount(() => { active = false; link.value = null })
const inviteReason = computed(() => {
  if (props.person.archived) return 'Человек находится в архиве.'
  if (props.person.has_account) return 'У человека уже есть аккаунт.'
  if (!props.person.has_global_roles) return 'Сначала выдайте глобальную роль.'
  return ''
})

async function act(action: 'invite' | 'password-reset-link' | 'disable' | 'enable') {
  if (busy.value || !can('people.invite')) return
  if (action === 'invite' && inviteReason.value) return
  if (action !== 'invite' && !props.person.has_account) return
  busy.value = true
  errorMessage.value = ''
  link.value = null
  try {
    const response = await api.post<{ data: components['schemas']['CreatedAccessLinkResource'] }>(`/people/${props.person.id}/${action}`)
    if (!active || !can('people.invite')) return
    if (action === 'invite' || action === 'password-reset-link') {
      link.value = { url: response.data.url, kind: action === 'invite' ? 'invite' : 'password_reset' }
    } else {
      emit('changed')
    }
    confirmDisable.value = false
  } catch (error) {
    if (active) errorMessage.value = apiErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.')
  } finally {
    if (active) busy.value = false
  }
}
</script>

<template>
  <section v-if="can('people.invite')">
    <h2>Аккаунт</h2>
    <p>{{ !person.has_account ? 'Аккаунт ещё не создан.' : person.account_disabled ? 'Аккаунт отключён.' : 'Аккаунт включён.' }}</p>
    <div class="actions">
      <button type="button" data-test="invite" :disabled="busy || !!inviteReason" :title="inviteReason" @click="act('invite')">Пригласить</button>
      <template v-if="person.has_account">
        <button type="button" data-test="password-reset" :disabled="busy" @click="act('password-reset-link')">Ссылка сброса пароля</button>
        <button v-if="person.account_disabled" type="button" data-test="enable-account" :disabled="busy" @click="act('enable')">Включить аккаунт</button>
        <button v-else type="button" data-test="disable-account" :disabled="busy" @click="confirmDisable = true">Отключить аккаунт</button>
      </template>
    </div>
    <p v-if="inviteReason" class="hint">{{ inviteReason }}</p>
    <div v-if="confirmDisable" role="group" aria-label="Подтверждение отключения аккаунта" class="confirmation">
      <p>Отключить аккаунт? Все устройства выйдут из системы. Человек и его история сохранятся.</p>
      <button type="button" data-test="confirm-account" :disabled="busy" @click="act('disable')">Подтвердить отключение</button>
      <button type="button" :disabled="busy" @click="confirmDisable = false">Отмена</button>
    </div>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <AccessLinkDialog v-if="link" :url="link.url" :kind="link.kind" @close="link = null" />
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
button { font: inherit; padding: 0.65rem; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.hint { color: #4b5563; }
.confirmation { padding: 1rem; margin-top: 1rem; border: 1px solid #8b96a6; border-radius: 0.5rem; }
.confirmation button { margin-right: 0.5rem; }
[role='alert'] { color: #a32020; }
</style>
