<script setup lang="ts">
import MinistryHeader from '~/components/ministries/MinistryHeader.vue'
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
    <p v-if="loading" role="status">Загрузка…</p>
  </section>
</template>

<style scoped>
.ministry-card { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
