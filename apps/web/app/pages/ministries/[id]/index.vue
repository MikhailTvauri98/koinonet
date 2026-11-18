<script setup lang="ts">
import MinistryComposition from '~/components/ministries/MinistryComposition.vue'
import MinistryHeader from '~/components/ministries/MinistryHeader.vue'
import MinistryLatestAnnouncement from '~/components/ministries/MinistryLatestAnnouncement.vue'
import MinistryUpcoming from '~/components/ministries/MinistryUpcoming.vue'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi(), auth = useAuthStore()
const route = useRoute()
const ministryId = computed(() => String(route.params.id))
const ministry = ref<Ministry | null>(null)
const loading = ref(false)
const errorMessage = ref('')
let requestVersion = 0, active = true
onBeforeUnmount(() => { active = false; requestVersion++ })
function resetContext() { requestVersion++; ministry.value = null; void load() }
watch([() => auth.sessionVersion, () => auth.user?.id], resetContext, { flush: 'sync' })

async function load() {
  const version = ++requestVersion, session = auth.sessionVersion
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`)
    if (!active || session !== auth.sessionVersion || version !== requestVersion) return
    ministry.value = response.data
  } catch (error) {
    if (!active || session !== auth.sessionVersion || version !== requestVersion) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить служение. Попробуйте ещё раз.')
  } finally {
    if (active && session === auth.sessionVersion && version === requestVersion) loading.value = false
  }
}

watch(() => route.params.id, resetContext, { flush: 'sync' })
await load()
</script>

<template>
  <section class="ministry-card">
    <MinistryHeader :ministry="ministry" :ministry-id="ministryId" :error="errorMessage" @updated="ministry = $event" @retry="load" />
    <p v-if="loading && !ministry" role="status">Загрузка…</p>
    <div v-if="ministry" class="overview-grid">
      <MinistryUpcoming :ministry-id="ministry.id" />
      <div class="overview-grid__side">
        <MinistryComposition :ministry-id="ministry.id" :default-role-id="ministry.default_role_id" />
        <MinistryLatestAnnouncement :ministry-id="ministry.id" />
        <NuxtLink v-if="ministry.chat_id" class="overview-chat ui-button" :to="`/ministries/${encodeURIComponent(ministry.id)}/chat`" data-test="overview-chat">Перейти в чат</NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ministry-card { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
.overview-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ui-space-4); }
.overview-grid__side { display: grid; gap: var(--ui-space-4); align-content: start; min-width: 0; }
.overview-chat { justify-self: start; max-width: 100%; }
.overview-grid :deep(.overview-block) { min-width: 0; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-4), 16px); }
.overview-grid :deep(.overview-block__header) { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-4); margin-bottom: var(--ui-space-3); }
.overview-grid :deep(.overview-block__header h2) { margin: 0; font-size: 1.125rem; flex: 1 1 8rem; }
@media (min-width: 48rem) { .overview-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
@media (max-width: 40rem) { .overview-grid :deep(.overview-block) { padding-inline: 0; border: 0; border-top: 1px solid var(--ui-border); border-radius: 0; } }
</style>
