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
.ministry-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 1rem 0; }
.ministry-tabs__active { font-weight: 600; }
</style>
