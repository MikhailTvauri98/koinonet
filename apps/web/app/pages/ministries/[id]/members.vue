<script setup lang="ts">
import AddMemberDialog from '~/components/ministries/AddMemberDialog.vue'
import MemberRow from '~/components/ministries/MemberRow.vue'
import { ministriesErrorMessage, rolesCatalogue, type Member } from '~/utils/ministries'

const api = useApi()
const route = useRoute()
const { canIn } = useCan()
const ministryId = computed(() => String(route.params.id))
const canManage = computed(() => canIn(ministryId.value, 'members.manage'))
const members = ref<Member[]>([])
const roles = computed(() => rolesCatalogue(members.value))
const loading = ref(false)
const errorMessage = ref('')
const showAddDialog = ref(false)
let requestVersion = 0

async function load() {
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: Member[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/members`)
    if (version === requestVersion) members.value = response.data
  } catch (error) {
    if (version !== requestVersion) return
    errorMessage.value = ministriesErrorMessage(error, 'Не удалось загрузить состав. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function onAdded(member: Member) {
  members.value = [...members.value, member]
  showAddDialog.value = false
}

function onRemoved(memberId: string) {
  members.value = members.value.filter(member => member.id !== memberId)
}

function onRolesChanged(updated: Member) {
  members.value = members.value.map(member => member.id === updated.id ? updated : member)
}

// Открытый диалог добавления теряет смысл, если members.manage сняли
// посреди сессии — сами MemberRow скрывают свои действия реактивно
// (canIn читается заново при каждом вызове, useCan.ts), здесь достаточно
// закрыть диалог добавления.
watch(canManage, (allowed) => { if (!allowed) showAddDialog.value = false })
watch(() => route.params.id, () => { void load() })
await load()
</script>

<template>
  <section class="members-tab">
    <nav aria-label="Разделы служения" class="members-tab__tabs">
      <NuxtLink :to="`/ministries/${ministryId}`">Обзор</NuxtLink>
      <NuxtLink :to="`/ministries/${ministryId}/members`" class="members-tab__tabs-active">Участники</NuxtLink>
    </nav>
    <header>
      <h1>Участники</h1>
      <button v-if="canManage" type="button" data-test="add-member" @click="showAddDialog = true">Добавить участника</button>
    </header>
    <AddMemberDialog
      v-if="showAddDialog && canManage" :ministry-id="ministryId"
      @added="onAdded" @close="showAddDialog = false"
    />
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <p v-else-if="!members.length" role="status">В служении пока нет участников.</p>
    <ul v-else class="members-tab__list">
      <MemberRow
        v-for="member in members" :key="member.id" :member="member" :ministry-id="ministryId"
        :roles-catalogue="roles" @removed="onRemoved" @roles-changed="onRolesChanged"
      />
    </ul>
  </section>
</template>

<style scoped>
.members-tab { max-width: 48rem; margin: 0 auto; color: #202b3a; }
.members-tab__tabs { display: flex; gap: 1rem; margin-bottom: 1rem; }
.members-tab__tabs-active { font-weight: 600; }
header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
h1 { margin: 0; }
.members-tab__list { list-style: none; padding: 0; margin: 0; }
button { font: inherit; padding: 0.65rem; cursor: pointer; background: #234e79; color: white; border: none; border-radius: 0.3rem; }
[role='alert'] { color: #a32020; }
</style>
