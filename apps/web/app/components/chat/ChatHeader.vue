<script setup lang="ts">
import type { components } from '~~/types/api'
import MediaUploader from '~/components/MediaUploader.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import ChatMembersDialog from './ChatMembersDialog.vue'
import MuteMenu from './MuteMenu.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = withDefaults(defineProps<{ chat: components['schemas']['ChatResource'], member: boolean, busy: boolean, backTo?: string, backLabel?: string }>(), { backTo: '/chats', backLabel: 'К списку чатов' })
const emit = defineEmits<{ changed: [] }>()
const api = useApi(), router = useRouter(), auth = useAuthStore(), chats = useChatsStore()
const menu = ref(false), members = ref(false), rename = ref(false), avatar = ref(false)
const title = ref(''), action = ref<'leave' | 'archive' | null>(null), error = ref(''), saving = ref(false), uploading = ref(false)
const disabled = computed(() => props.busy || saving.value || uploading.value)
const group = computed(() => props.chat.type === 'group' && !props.chat.archived)
const manage = computed(() => group.value && props.chat.can_manage_members)
const canLeave = computed(() => group.value && props.member && !props.chat.is_owner)
const canArchive = computed(() => group.value && (props.chat.is_owner || props.chat.can_manage_members))
let revision = 0
async function run(callback: () => Promise<unknown>, leave = false) {
  if (disabled.value) return
  const token = revision, session = auth.sessionVersion
  saving.value = true; error.value = ''
  try {
    await callback()
    if (token !== revision || session !== auth.sessionVersion) return
    action.value = null; rename.value = false
    void chats.fetch()
    if (leave) await router.push('/chats')
    else emit('changed')
  } catch (failure) { if (token === revision && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось выполнить действие. Попробуйте ещё раз.') }
  finally { if (token === revision) saving.value = false }
}
function mute(hours?: number) {
  if (props.member) void run(() => api.post(`/chats/${props.chat.id}/mute`, hours ? { until: new Date(Date.now() + hours * 3600000).toISOString() } : {}))
}
function unmute() { if (props.member) void run(() => api.delete(`/chats/${props.chat.id}/mute`)) }
function saveTitle() { if (manage.value && title.value.trim()) void run(() => api.patch(`/chats/${props.chat.id}`, { title: title.value.trim() })) }
function confirm() {
  if (action.value === 'leave' && canLeave.value) void run(() => api.post(`/chats/${props.chat.id}/leave`, {}), true)
  else if (action.value === 'archive' && canArchive.value) void run(() => api.post(`/chats/${props.chat.id}/archive`, {}))
}
async function openAction(next: 'members' | 'rename' | 'avatar' | 'leave' | 'archive') {
  const token = revision
  menu.value = false
  await nextTick()
  if (token !== revision) return
  if (next === 'members') members.value = true
  else if (next === 'rename') { title.value = props.chat.title; rename.value = true }
  else if (next === 'avatar') avatar.value = true
  else action.value = next
}
function reset() { revision++; menu.value = false; members.value = false; rename.value = false; avatar.value = false; action.value = null; error.value = ''; saving.value = false }
watch([() => props.chat.id, () => auth.sessionVersion], reset)
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <header class="chat-header">
    <NuxtLink :to="backTo" :aria-label="backLabel" :title="backLabel" class="chat-header__back" :class="{ 'chat-header__back--list': backTo === '/chats' }" data-test="chat-back"><span aria-hidden="true">←</span></NuxtLink>
    <div class="chat-header__identity">
      <img v-if="chat.avatar_url" :src="chat.avatar_url" alt="" width="44" height="44">
      <div><h1>{{ chat.title }}</h1><details><summary>Участники: {{ chat.members.length }}</summary><ul><li v-for="person in chat.members" :key="person.user_id">{{ person.full_name || 'Участник' }}</li></ul></details></div>
    </div>
    <button type="button" class="chat-header__menu" data-test="menu" aria-label="Меню чата" title="Меню чата" aria-haspopup="dialog" :aria-expanded="menu" @click="menu = !menu"><span aria-hidden="true">⋯</span></button>
    <UiDialog v-if="menu" :open="true" label="Меню чата" @close="menu = false">
      <h2>Меню чата</h2>
      <div class="chat-menu">
      <MuteMenu v-if="member" :until="chat.muted_until" :disabled="disabled" @mute="mute" @unmute="unmute" />
      <button v-if="chat.type === 'group'" type="button" data-test="members" :disabled="disabled" @click="openAction('members')">Участники группы</button>
      <button v-if="manage" type="button" data-test="rename" :disabled="disabled" @click="openAction('rename')">Переименовать</button>
      <button v-if="manage" type="button" data-test="avatar" :disabled="disabled" @click="openAction('avatar')">Сменить аватар</button>
      <button v-if="canLeave" type="button" data-test="leave" :disabled="disabled" @click="openAction('leave')">Выйти</button>
      <button v-if="canArchive" type="button" data-test="archive" :disabled="disabled" @click="openAction('archive')">Архивировать</button>
      <slot name="menu" />
      <button type="button" @click="menu = false">Закрыть</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
    </UiDialog>
    <ChatMembersDialog v-if="members && chat.type === 'group'" :key="chat.id" :chat="chat" @changed="emit('changed')" @close="members = false" />
    <UiDialog v-if="rename && manage" :open="true" label="Переименовать группу" @close="!disabled && (rename = false)">
    <form @submit.prevent="saveTitle">
      <label>Название<input v-model="title" data-test="group-title" maxlength="100" required :disabled="disabled"></label>
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
.chat-menu { display: flex; flex-direction: column; gap: .4rem; }
[role='dialog'], [role='alertdialog'], form { flex-basis: 100%; }
[role='alert'] { color: var(--ui-danger); }
</style>
