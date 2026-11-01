<script setup lang="ts">
import type { Ministry } from '~/utils/ministries'
// Вкладки служения — одни на карточку, состав и роли. «Роли» видит только
// тот, кто читает список ролей служения: носитель roles.manage или
// members.manage в этом служении (docs/architecture.md, 6.1); остальным
// вкладка вела бы на отказ.
const props = defineProps<{ ministryId: string, chatId?: string | null }>()
const { canIn } = useCan()
const api = useApi(), auth = useAuthStore()
const loadedChat = ref<string | null>(null), chatError = ref(false)
const visibleChat = computed(() => props.chatId === undefined ? loadedChat.value : props.chatId)
let revision = 0
async function loadChat() {
  const token = ++revision, session = auth.sessionVersion
  loadedChat.value = null; chatError.value = false
  if (props.chatId !== undefined) return
  try {
    const result = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(props.ministryId)}`)
    if (token === revision && session === auth.sessionVersion) loadedChat.value = result.data.chat_id
  } catch { if (token === revision && session === auth.sessionVersion) chatError.value = true }
}
watch([() => props.ministryId, () => props.chatId], () => { void loadChat() })
watch(() => auth.sessionVersion, () => { revision++; loadedChat.value = null; chatError.value = false })
onMounted(() => { void loadChat() })
onBeforeUnmount(() => { revision++ })

const base = computed(() => `/ministries/${encodeURIComponent(props.ministryId)}`)
const canSeeRoles = computed(() => canIn(props.ministryId, 'roles.manage') || canIn(props.ministryId, 'members.manage'))
</script>

<template>
  <nav aria-label="Разделы служения" class="ministry-tabs">
    <NuxtLink :to="base" exact-active-class="ministry-tabs__active">Обзор</NuxtLink>
    <NuxtLink :to="`${base}/members`" exact-active-class="ministry-tabs__active">Участники</NuxtLink>
    <NuxtLink :to="`${base}/events`" exact-active-class="ministry-tabs__active">События</NuxtLink>
    <NuxtLink :to="`${base}/announcements`" exact-active-class="ministry-tabs__active">Объявления</NuxtLink>
    <NuxtLink v-if="visibleChat" data-test="ministry-chat-tab" :to="`${base}/chat`" exact-active-class="ministry-tabs__active">Чат</NuxtLink>
    <button v-else-if="chatError" type="button" @click="loadChat">Обновить вкладку чата</button>
    <NuxtLink v-if="canSeeRoles" :to="`${base}/roles`" exact-active-class="ministry-tabs__active">Роли</NuxtLink>
  </nav>
</template>

<style scoped>
.ministry-tabs { min-width: 0; display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-block: var(--ui-space-4) var(--ui-space-6); }
.ministry-tabs a { display: inline-flex; align-items: center; min-height: var(--ui-control-height); max-width: 100%; padding: var(--ui-space-2) var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); text-decoration: none; background: var(--ui-surface); overflow-wrap: anywhere; }
.ministry-tabs .ministry-tabs__active { font-weight: 650; background: var(--ui-accent-soft); border-color: var(--ui-accent); }
.ministry-tabs button { max-width: 100%; }
</style>
