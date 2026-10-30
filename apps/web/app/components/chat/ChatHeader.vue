<script setup lang="ts">
import type { components } from '~~/types/api'
import MediaUploader from '~/components/MediaUploader.vue'
import ChatMembersDialog from './ChatMembersDialog.vue'
import MuteMenu from './MuteMenu.vue'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ chat: components['schemas']['ChatResource'], member: boolean, busy: boolean }>()
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
function reset() { revision++; menu.value = false; members.value = false; rename.value = false; avatar.value = false; action.value = null; error.value = ''; saving.value = false }
watch([() => props.chat.id, () => auth.sessionVersion], reset)
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <header class="chat-header">
    <img v-if="chat.avatar_url" :src="chat.avatar_url" alt="" width="44" height="44">
    <div><h1>{{ chat.title }}</h1><details><summary>Участники: {{ chat.members.length }}</summary><ul><li v-for="person in chat.members" :key="person.user_id">{{ person.full_name || 'Участник' }}</li></ul></details></div>
    <button type="button" data-test="menu" :aria-expanded="menu" @click="menu = !menu">Меню чата</button>
    <div v-if="menu" class="chat-menu">
      <MuteMenu v-if="member" :until="chat.muted_until" :disabled="disabled" @mute="mute" @unmute="unmute" />
      <button v-if="chat.type === 'group'" type="button" data-test="members" :disabled="disabled" @click="members = true">Участники группы</button>
      <button v-if="manage" type="button" data-test="rename" :disabled="disabled" @click="title = chat.title; rename = true">Переименовать</button>
      <button v-if="manage" type="button" data-test="avatar" :disabled="disabled" @click="avatar = !avatar">Сменить аватар</button>
      <button v-if="canLeave" type="button" data-test="leave" :disabled="disabled" @click="action = 'leave'">Выйти</button>
      <button v-if="canArchive" type="button" data-test="archive" :disabled="disabled" @click="action = 'archive'">Архивировать</button>
      <slot name="menu" />
    </div>
    <ChatMembersDialog v-if="members && chat.type === 'group'" :key="chat.id" :chat="chat" @changed="emit('changed')" @close="members = false" />
    <form v-if="rename && manage" @submit.prevent="saveTitle">
      <label>Название<input v-model="title" data-test="group-title" maxlength="100" required :disabled="disabled"></label>
      <button type="submit" data-test="save-title" :disabled="disabled || !title.trim()">Сохранить</button><button type="button" :disabled="disabled" @click="rename = false">Отмена</button>
    </form>
    <MediaUploader v-if="avatar && manage" :key="chat.id" purpose="chat_avatar" :target="`/chats/${chat.id}/avatar`" label="Выбрать аватар" :disabled="busy || saving" @busy="uploading = $event" @attached="emit('changed'); void chats.fetch()" />
    <div v-if="action && (action === 'leave' ? canLeave : canArchive)" role="alertdialog" :aria-label="action === 'leave' ? 'Выйти из группы?' : 'Архивировать группу?'">
      <p>{{ action === 'leave' ? 'Выйти из группы? Доступ к истории будет закрыт.' : 'Архивировать группу? История сохранится, писать будет нельзя.' }}</p>
      <button type="button" data-test="confirm-action" :disabled="disabled" @click="confirm">Подтвердить</button><button type="button" :disabled="disabled" @click="action = null">Отмена</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </header>
</template>
<style scoped>
.chat-header { display: flex; flex-wrap: wrap; align-items: center; gap: .8rem; padding: .7rem 0; border-bottom: 1px solid #d5dde4; }
h1 { font-size: 1.25rem; margin: 0 0 .2rem; overflow-wrap: anywhere; }
.chat-header > button { margin-left: auto; }
.chat-header img { border-radius: 50%; object-fit: cover; }
.chat-menu { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: .4rem; }
[role='dialog'], [role='alertdialog'], form { flex-basis: 100%; }
[role='alert'] { color: #a32020; }
</style>
