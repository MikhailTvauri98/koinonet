<script setup lang="ts">
import type { components } from '~~/types/api'
import { isNavigationFailure } from 'vue-router'
import MediaUploader from '~/components/MediaUploader.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import ChatMembersDialog from './ChatMembersDialog.vue'
import ChatInfoDialog from './ChatInfoDialog.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = withDefaults(defineProps<{ chat: components['schemas']['ChatResource'], member: boolean, busy: boolean, backTo?: string, backLabel?: string }>(), { backTo: '/chats', backLabel: 'К списку чатов' })
const emit = defineEmits<{ changed: [] }>()
const api = useApi(), router = useRouter(), auth = useAuthStore(), chats = useChatsStore()
const menuButton = ref<HTMLButtonElement>()
const menu = ref(false), members = ref(false), rename = ref(false), avatar = ref(false)
const titleId = useId()
const title = ref(''), action = ref<'leave' | 'archive' | null>(null), error = ref(''), saving = ref(false), uploading = ref(false)
const confirmed = ref(''), navigationError = ref(''), left = ref(false), archived = ref(false)
const disabled = computed(() => props.busy || saving.value || uploading.value)
const group = computed(() => props.chat.type === 'group' && !props.chat.archived && !left.value && !archived.value)
const manage = computed(() => group.value && props.chat.can_manage_members)
const canLeave = computed(() => group.value && props.member && !props.chat.is_owner)
const canArchive = computed(() => group.value && (props.chat.is_owner || props.chat.can_manage_members))
type Chat = components['schemas']['ChatResource']
const mutedUntil = ref<string | null>()
const informationChat = computed(() => ({ ...props.chat,
  muted_until: mutedUntil.value === undefined ? props.chat.muted_until : mutedUntil.value,
  archived: props.chat.archived || archived.value,
  can_manage_members: props.chat.can_manage_members && !left.value && !archived.value,
}))
watch(() => props.chat.muted_until, () => { mutedUntil.value = undefined })
type Operation = 'member' | 'manage' | 'leave' | 'archive'
let revision = 0, operation: Operation | null = null
async function openList() {
  if (disabled.value || !left.value) return
  const token = revision, session = auth.sessionVersion
  saving.value = true; navigationError.value = ''
  try {
    const result = await router.push('/chats')
    if (isNavigationFailure(result)) throw result
  } catch {
    if (token === revision && session === auth.sessionVersion) navigationError.value = 'Не удалось открыть список чатов. Повторите переход.'
  } finally { if (token === revision && session === auth.sessionVersion) saving.value = false }
}
async function run<T>(callback: () => Promise<T>, kind: Operation, message: string, apply?: (result: T) => void) {
  if (disabled.value) return
  const token = revision, session = auth.sessionVersion
  operation = kind; saving.value = true; error.value = ''; confirmed.value = ''
  try {
    const result = await callback()
    if (token !== revision || session !== auth.sessionVersion) return
    apply?.(result)
    action.value = null; rename.value = false; confirmed.value = message
    // Clear the operation before the confirmed state updates capability guards.
    operation = null
    if (kind === 'leave') { left.value = true; menu.value = false }
    if (kind === 'archive') { archived.value = true; menu.value = false }
    void chats.fetch()
    if (kind !== 'leave') emit('changed')
  } catch (failure) { if (token === revision && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось выполнить действие. Попробуйте ещё раз.') }
  finally { if (token === revision && session === auth.sessionVersion) { saving.value = false; operation = null } }
  if (token === revision && session === auth.sessionVersion && kind === 'leave' && left.value) await openList()
}
function mute(hours?: number) {
  if (props.member && !left.value) void run(() => api.post<{ data: Chat }>(`/chats/${props.chat.id}/mute`, hours ? { until: new Date(Date.now() + hours * 3600000).toISOString() } : {}), 'member', 'Настройка звука сохранена', result => { mutedUntil.value = result.data.muted_until })
}
function unmute() { if (props.member && !left.value) void run(() => api.delete<{ data: Chat }>(`/chats/${props.chat.id}/mute`), 'member', 'Звук включён', result => { mutedUntil.value = result.data.muted_until }) }
function saveTitle() { if (manage.value && title.value.trim()) void run(() => api.patch(`/chats/${props.chat.id}`, { title: title.value.trim() }), 'manage', 'Название сохранено') }
function confirm() {
  if (action.value === 'leave' && canLeave.value) void run(() => api.post(`/chats/${props.chat.id}/leave`, {}), 'leave', 'Вы вышли из группы')
  else if (action.value === 'archive' && canArchive.value) void run(() => api.post(`/chats/${props.chat.id}/archive`, {}), 'archive', 'Группа архивирована')
}
async function openAction(next: 'members' | 'rename' | 'avatar' | 'leave' | 'archive') {
  if (disabled.value) return
  const token = revision
  menu.value = false
  await nextTick()
  if (token !== revision) return
  // The previous dialog's action is removed; a reachable persistent opener
  // becomes the new dialog's return target before showModal captures focus.
  menuButton.value?.focus()
  if (next === 'members' && props.chat.type !== 'direct') members.value = true
  else if (next === 'rename' && manage.value) { title.value = props.chat.title; rename.value = true }
  else if (next === 'avatar' && manage.value) avatar.value = true
  else if (next === 'leave' && canLeave.value) action.value = 'leave'
  else if (next === 'archive' && canArchive.value) action.value = 'archive'
}
function invalidateOperation(kind: Operation) {
  if (operation !== kind) return
  revision++; operation = null; saving.value = false; error.value = ''
}
watch(manage, (allowed, previous) => { if (previous && !allowed) { rename.value = false; avatar.value = false; uploading.value = false; invalidateOperation('manage') } }, { flush: 'sync' })
watch(canLeave, (allowed, previous) => { if (previous && !allowed) { if (action.value === 'leave') action.value = null; invalidateOperation('leave') } }, { flush: 'sync' })
watch(canArchive, (allowed, previous) => { if (previous && !allowed) { if (action.value === 'archive') action.value = null; invalidateOperation('archive') } }, { flush: 'sync' })
watch(() => props.member, (allowed, previous) => { if (previous && !allowed) invalidateOperation('member') }, { flush: 'sync' })
function reset() { revision++; operation = null; menu.value = false; members.value = false; rename.value = false; avatar.value = false; action.value = null; error.value = ''; saving.value = false; uploading.value = false; confirmed.value = ''; navigationError.value = ''; left.value = false; archived.value = false; mutedUntil.value = undefined }
watch([() => props.chat.id, () => props.chat.type, () => auth.sessionVersion], reset, { flush: 'sync' })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <header class="chat-header">
    <NuxtLink :to="backTo" :aria-label="backLabel" :title="backLabel" class="chat-header__back" :class="{ 'chat-header__back--list': backTo === '/chats' }" data-test="chat-back"><span aria-hidden="true">←</span></NuxtLink>
    <div class="chat-header__identity">
      <img v-if="chat.avatar_url" :src="chat.avatar_url" alt="" width="44" height="44">
      <div><h1>{{ chat.title }}</h1></div>
    </div>
    <button ref="menuButton" type="button" class="chat-header__menu" data-test="menu" aria-label="Меню чата" title="Меню чата" aria-haspopup="dialog" :aria-expanded="menu" @click="menu = !menu"><span aria-hidden="true">⋯</span></button>
    <ChatInfoDialog v-if="menu" :chat="informationChat" :member="member" :disabled="disabled" :left="left" :archived="archived" @close="menu = false" @action="openAction" @mute="mute" @unmute="unmute">
      <template #menu><slot name="menu" /></template>
      <p v-if="confirmed" role="status">{{ confirmed }} <button type="button" data-test="refresh-chat" :disabled="disabled" @click="emit('changed')">Обновить сведения</button></p>
      <p v-if="error" role="alert">{{ error }}</p>
    </ChatInfoDialog>
    <ChatMembersDialog v-if="members && chat.type !== 'direct'" :key="chat.id" :chat="informationChat" @changed="emit('changed')" @close="members = false" />
    <UiDialog v-if="rename && manage" :open="true" label="Переименовать группу" @close="!disabled && (rename = false)">
    <form @submit.prevent="saveTitle">
      <label :for="titleId">Название</label><input :id="titleId" v-model="title" data-test="group-title" maxlength="100" required :disabled="disabled">
      <button type="submit" data-test="save-title" :disabled="disabled || !title.trim()">Сохранить</button><button type="button" :disabled="disabled" @click="rename = false">Отмена</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    </UiDialog>
    <UiDialog v-if="avatar && manage" :open="true" label="Сменить аватар" @close="!disabled && (avatar = false)">
    <MediaUploader :key="chat.id" purpose="chat_avatar" :target="`/chats/${chat.id}/avatar`" label="Выбрать аватар" :disabled="busy || saving" @busy="uploading = $event" @attached="emit('changed'); void chats.fetch()" />
    <button type="button" :disabled="disabled" @click="avatar = false">Закрыть</button>
    </UiDialog>
    <UiDialog v-if="action && (action === 'leave' ? canLeave : canArchive)" :open="true" role="alertdialog" :label="action === 'leave' ? 'Выйти из группы?' : 'Архивировать группу?'" @close="!disabled && (action = null)">
      <p>{{ action === 'leave' ? 'Выйти из группы? Доступ к истории будет закрыт.' : 'Архивировать группу? История сохранится, писать будет нельзя.' }}</p>
      <button type="button" data-test="confirm-action" :disabled="disabled" @click="confirm">Подтвердить</button><button type="button" :disabled="disabled" @click="action = null">Отмена</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </UiDialog>
    <p v-if="confirmed && !menu" class="chat-header__feedback" role="status">{{ confirmed }}</p>
    <div v-if="navigationError" class="chat-header__feedback" role="alert">{{ navigationError }} <button type="button" data-test="retry-navigation" :disabled="disabled" @click="openList">Открыть список чатов</button></div>
    <p v-if="error && !menu && !rename && !action" role="alert">{{ error }}</p>
  </header>
</template>
<style scoped>
.chat-header { display: flex; flex-wrap: wrap; align-items: start; gap: .4rem; padding: .25rem 0; border-bottom: 1px solid var(--ui-border); }
.chat-header__back { display: flex; flex: 0 0 44px; min-height: 44px; align-items: center; justify-content: center; border-radius: var(--ui-radius-sm); font-size: 1.25rem; text-decoration: none; }
.chat-header__menu { min-width: 44px; min-height: 44px; padding-inline: min(.5rem, 8px); font-size: 1.25rem; }
.chat-header__back:hover { background: var(--ui-surface-muted); }
@media (min-width: 1024px) { .chat-header__back--list { display: none; } }
.chat-header__identity { display: flex; flex: 1 1 10rem; min-width: 0; align-items: start; gap: .4rem; }
.chat-header__identity > div { flex: 1; min-width: 0; }
h1 { font-size: 1.125rem; margin: 0 0 .2rem; overflow-wrap: anywhere; }
.chat-header > button { flex: 0 0 auto; max-width: 100%; margin-left: auto; }
.chat-header img { flex: 0 0 44px; border-radius: 50%; object-fit: cover; }
.chat-header__feedback { flex-basis: 100%; margin: .25rem 0; }
[role='dialog'], [role='alertdialog'], form { flex-basis: 100%; }
[role='alert'] { color: var(--ui-danger); }
</style>
