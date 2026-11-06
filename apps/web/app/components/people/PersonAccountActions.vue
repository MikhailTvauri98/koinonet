<script setup lang="ts">
import type { components } from '~~/types/api'
import AccessLinkDialog from '~/components/people/AccessLinkDialog.vue'
import type { Person } from '~/utils/people'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{ person: Person, disabled?: boolean }>()
const emit = defineEmits<{ changed: [], busy: [value: boolean] }>()
const api = useApi()
const auth = useAuthStore()
const { can } = useCan()
const busy = ref(false)
const errorMessage = ref('')
const confirmDisable = ref(false)
const link = ref<{ url: string, kind: 'invite' | 'password_reset' } | null>(null)
watch(() => busy.value || !!link.value, value => emit('busy', value), { flush: 'sync' })
let linkOpener: HTMLElement | null = null
let active = true
let generation = 0
function reset() { linkOpener = null; generation++; busy.value = false; errorMessage.value = ''; confirmDisable.value = false; link.value = null }
watch([() => props.person.id, () => auth.sessionVersion, () => auth.user?.id, () => can('people.invite')], reset, { flush: 'sync' })
onBeforeUnmount(() => { active = false; reset() })
const inviteReason = computed(() => {
  if (props.person.archived) return 'Человек находится в архиве.'
  if (props.person.has_account) return 'У человека уже есть аккаунт.'
  if (!props.person.has_global_roles) return 'Сначала выдайте глобальную роль.'
  return ''
})
async function act(action: 'invite' | 'password-reset-link' | 'disable' | 'enable') {
  if (props.disabled || busy.value || link.value || !can('people.invite')) return
  if (action === 'invite' && inviteReason.value) return
  if (action !== 'invite' && !props.person.has_account) return
  linkOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const version = ++generation
  const current = () => active && version === generation && can('people.invite')
  busy.value = true
  errorMessage.value = ''
  link.value = null
  try {
    const response = await api.post<{ data: components['schemas']['CreatedAccessLinkResource'] }>(`/people/${encodeURIComponent(props.person.id)}/${action}`)
    if (!current()) return
    if (action === 'invite' || action === 'password-reset-link') {
      link.value = { url: response.data.url, kind: action === 'invite' ? 'invite' : 'password_reset' }
    } else emit('changed')
    confirmDisable.value = false
  } catch (error) {
    if (current()) errorMessage.value = apiErrorMessage(error, 'Не удалось выполнить действие. Попробуйте ещё раз.')
  } finally {
    if (current()) busy.value = false
  }
}
async function closeLink() {
  const target = linkOpener
  const version = generation
  link.value = null
  await nextTick()
  if (active && version === generation && target?.isConnected && !target.matches(':disabled')) target.focus()
}
</script>

<template>
  <section v-if="can('people.invite')" class="person-account">
    <h2>Аккаунт</h2>
    <p class="person-account__status">{{ !person.has_account ? 'Аккаунт ещё не создан.' : person.account_disabled ? 'Аккаунт отключён.' : 'Аккаунт включён.' }}</p>
    <button v-if="!person.has_account" type="button" class="ui-button" data-test="invite" :disabled="disabled || busy || !!inviteReason" :title="inviteReason" @click="act('invite')">{{ busy ? 'Создаём ссылку…' : 'Пригласить' }}</button>
    <template v-else>
      <button type="button" class="ui-button" data-test="invite" disabled :title="inviteReason">Пригласить</button>
      <button type="button" class="ui-button" data-test="password-reset" :disabled="disabled || busy" @click="act('password-reset-link')">Ссылка сброса пароля</button>
      <details class="person-account__management">
        <summary>Управление аккаунтом</summary>
        <button v-if="person.account_disabled" type="button" class="ui-button" data-test="enable-account" :disabled="disabled || busy" @click="act('enable')">Включить аккаунт</button>
        <button v-else type="button" class="ui-button ui-button--danger" data-test="disable-account" :disabled="disabled || busy" @click="confirmDisable = true">Отключить аккаунт</button>
      </details>
    </template>
    <p v-if="inviteReason && !person.has_account" class="ui-hint">{{ inviteReason }}</p>
    <div v-if="confirmDisable" role="group" aria-label="Подтверждение отключения аккаунта" class="person-account__confirmation">
      <p>Отключить аккаунт? Все устройства выйдут из системы. Человек и его история сохранятся.</p>
      <div class="person-account__actions">
        <button type="button" class="ui-button ui-button--danger" data-test="confirm-account" :disabled="disabled || busy" @click="act('disable')">Подтвердить отключение</button>
        <button type="button" class="ui-button" :disabled="disabled || busy" @click="confirmDisable = false">Отмена</button>
      </div>
    </div>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <AccessLinkDialog v-if="link" :url="link.url" :kind="link.kind" @close="closeLink" />
  </section>
</template>

<style scoped>
.person-account { min-width: 0; padding: min(var(--ui-space-6), 24px); border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); }
h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
.person-account__status, .ui-hint { color: var(--ui-text-muted); }
.person-account__status { margin: 0 0 var(--ui-space-4); }
.person-account > button { margin: 0 var(--ui-space-2) var(--ui-space-2) 0; }
.person-account__management { margin-top: var(--ui-space-3); border-top: 1px solid var(--ui-border); }
summary { min-height: 44px; align-content: center; cursor: pointer; }
.person-account__confirmation { padding: var(--ui-space-3); margin-top: var(--ui-space-3); background: var(--ui-surface-muted); border: 1px solid var(--ui-border); border-radius: 10px; }
.person-account__actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
[role='alert'] { color: var(--ui-danger); }
@media (max-width: 479px) { .person-account { padding: 16px; } }
</style>
