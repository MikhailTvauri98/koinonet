<script setup lang="ts">
import ChatScreen from '~/components/chat/ChatScreen.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'
const api = useApi(), route = useRoute(), auth = useAuthStore()
const id = computed(() => String(route.params.id)), ministry = ref<Ministry | null>(null), error = ref(''), loading = ref(false)
let generation = 0
async function load() {
  const token = ++generation, session = auth.sessionVersion
  ministry.value = null; error.value = ''; loading.value = true
  try {
    const result = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(id.value)}`)
    if (token === generation && session === auth.sessionVersion) ministry.value = result.data
  } catch (failure) { if (token === generation && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось загрузить служение. Попробуйте ещё раз.') }
  finally { if (token === generation && session === auth.sessionVersion) loading.value = false }
}
watch(id, () => { void load() })
watch(() => auth.sessionVersion, () => { generation++; ministry.value = null; loading.value = false })
onBeforeUnmount(() => { generation++ })
await load()
</script>
<template>
  <section>
    <NuxtLink to="/ministries">К списку служений</NuxtLink>
    <MinistryTabs :ministry-id="id" :chat-id="ministry?.chat_id" />
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Повторить</button></p>
    <ChatScreen v-if="ministry?.chat_id" :key="ministry.chat_id" :chat-id="ministry.chat_id" />
    <p v-else-if="ministry" role="status">Чат служения ещё не создан. <button type="button" @click="load">Обновить</button></p>
  </section>
</template>
