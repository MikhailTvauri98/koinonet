<script setup lang="ts">
import UiAvatar from '~/components/ui/UiAvatar.vue'
import type { Member } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

// «Состав»: аватары первых участников и распределение по ролям. Роль по умолчанию
// в распределение не входит (по `default_role_id`, имя роли в условиях не участвует).
const props = defineProps<{ ministryId: string, defaultRoleId?: string | null }>()
const AVATARS = 12
const api = useApi(), auth = useAuthStore()
const { can } = useCan()
const members = ref<Member[]>([]), loaded = ref(false), loading = ref(false), errorMessage = ref('')
let generation = 0

async function load() {
  const current = ++generation, session = auth.sessionVersion, id = props.ministryId
  const live = () => current === generation && session === auth.sessionVersion && id === props.ministryId
  loading.value = true; errorMessage.value = ''
  try {
    const response = await api.get<{ data: Member[] }>(`/ministries/${encodeURIComponent(id)}/members`)
    if (live()) { members.value = response.data; loaded.value = true }
  } catch (error) {
    if (live()) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить состав. Попробуйте ещё раз.')
  } finally { if (live()) loading.value = false }
}
function reset() { generation++; members.value = []; loaded.value = false; errorMessage.value = ''; loading.value = false; if (auth.user) void load() }
watch([() => props.ministryId, () => auth.sessionVersion, () => can('people.view')], reset, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })

const shown = computed(() => members.value.slice(0, AVATARS))
const distribution = computed(() => {
  const counts = new Map<string, { name: string, count: number }>()
  for (const member of members.value) {
    for (const role of member.roles) {
      if (role.id === props.defaultRoleId) continue
      const entry = counts.get(role.id)
      if (entry) entry.count++
      else counts.set(role.id, { name: role.name, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru')).map(entry => `${entry.name} ${entry.count}`).join(' · ')
})
void load()
</script>

<template>
  <section class="overview-block" aria-labelledby="overview-composition-title" data-test="overview-composition">
    <header class="overview-block__header">
      <h2 id="overview-composition-title">Состав</h2>
      <NuxtLink class="ui-button ui-button--quiet" :to="`/ministries/${encodeURIComponent(ministryId)}/members`" data-test="all-members">Все участники</NuxtLink>
    </header>
    <p v-if="loading && !loaded" role="status">Загружаем состав…</p>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button type="button" class="ui-button" data-test="retry-composition" :disabled="loading" @click="load">Повторить</button></p>
    <template v-if="loaded && !errorMessage">
      <ul v-if="shown.length" class="composition-avatars" aria-label="Участники">
        <li v-for="member in shown" :key="member.id" data-test="composition-member">
          <UiAvatar :id="member.person_id" :name="member.full_name" :photo-url="member.photo_url" size="md" decorative />
          <span class="composition-avatars__name">{{ member.full_name || 'Участник' }}</span>
        </li>
      </ul>
      <p v-else class="ui-hint">В служении пока нет участников.</p>
      <p v-if="distribution" class="composition-roles" data-test="composition-roles">{{ distribution }}</p>
    </template>
  </section>
</template>

<style scoped>
.composition-avatars { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); list-style: none; margin: 0 0 var(--ui-space-3); padding: 0; }
.composition-avatars li { position: relative; }
.composition-avatars__name { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.composition-roles { margin: 0; color: var(--ui-text-muted); font-size: .875rem; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
