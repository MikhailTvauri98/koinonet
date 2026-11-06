<script setup lang="ts">
import AddMemberDialog from '~/components/ministries/AddMemberDialog.vue'
import PageHeader from '~/components/ui/PageHeader.vue'
import MemberDetailsDialog from '~/components/ministries/MemberDetailsDialog.vue'
import MemberRow from '~/components/ministries/MemberRow.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import type { Member, MinistryRole } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi(), auth = useAuthStore()
const route = useRoute()
const { can, canIn } = useCan()
const ministryId = computed(() => String(route.params.id))
const canManage = computed(() => canIn(ministryId.value, 'members.manage'))
// Кандидатов для добавления ищет `GET /people`, а он требует people.view:
// без справочника кнопка вела бы в поиск, который всегда отказывает.
const canAdd = computed(() => canManage.value && can('people.view'))
const members = ref<Member[]>([])
// Полный каталог ролей служения, не только те, что уже у кого-то есть:
// GET /ministries/{id}/roles теперь открыт носителю members.manage в этом
// служении (доделка задачи 28 — раньше требовалось roles.manage, и роль,
// которую пока никто не носит, выдать было нечем). Запрашивается, только
// если управление доступно: без members.manage чекбоксы всё равно скрыты,
// а без roles.manage тот же запрос ответил бы 403.
const roles = ref<{ id: string, name: string }[]>([])
const rolesError = ref(''), rolesLoading = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const showAddDialog = ref(false)
const selectedMember = ref<Member | null>(null)
const search = ref('')
const filteredMembers = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  return members.value.filter(member => !query || [member.full_name || '', ...member.roles.map(role => role.name)].join(' ').toLocaleLowerCase('ru').includes(query))
})
const canSeePeople = computed(() => can('people.view'))
let active = true
onBeforeUnmount(() => { active = false; requestVersion++; rolesRequestVersion++ })
let requestVersion = 0
let rolesRequestVersion = 0

async function load() {
  const version = ++requestVersion, session = auth.sessionVersion
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: Member[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/members`)
    if (active && session === auth.sessionVersion && version === requestVersion) members.value = response.data
  } catch (error) {
    if (!active || session !== auth.sessionVersion || version !== requestVersion) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить состав. Попробуйте ещё раз.')
  } finally {
    if (active && session === auth.sessionVersion && version === requestVersion) loading.value = false
  }
}

async function loadRoles() {
  if (!canManage.value) return
  const version = ++rolesRequestVersion, session = auth.sessionVersion
  rolesError.value = ''; rolesLoading.value = true
  try {
    const response = await api.get<{ data: MinistryRole[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/roles`)
    if (active && canManage.value && session === auth.sessionVersion && version === rolesRequestVersion) roles.value = response.data.map(role => ({ id: role.id, name: role.name }))
  } catch (error) {
    if (active && canManage.value && session === auth.sessionVersion && version === rolesRequestVersion) {
      rolesError.value = apiErrorMessage(error, 'Не удалось загрузить роли служения. Попробуйте ещё раз.')
    }
  } finally {
    if (active && session === auth.sessionVersion && version === rolesRequestVersion) rolesLoading.value = false
  }
}

function onAdded(member: Member) {
  members.value = [...members.value, member]
  showAddDialog.value = false
}

function onRemoved(memberId: string) {
  members.value = members.value.filter(member => member.id !== memberId)
  selectedMember.value = null
}

function onRolesChanged(updated: Member) {
  members.value = members.value.map(member => member.id === updated.id ? updated : member)
  selectedMember.value = updated
}

// Closing editors and invalidating the catalogue follows actual capability loss,
// not an unrelated refresh of the same account's permissions.
watch(canManage, (allowed) => {
  if (allowed) {
    void loadRoles()
  } else {
    rolesRequestVersion++
    roles.value = []; rolesLoading.value = false; rolesError.value = ''
    selectedMember.value = null
  }
})
watch(canAdd, (allowed) => { if (!allowed) showAddDialog.value = false })
function resetContext() {
  requestVersion++; rolesRequestVersion++
  showAddDialog.value = false; selectedMember.value = null
  members.value = []; roles.value = []; rolesLoading.value = false; rolesError.value = ''; search.value = ''
  void Promise.all([load(), loadRoles()])
}
watch([() => route.params.id, () => auth.sessionVersion, () => auth.user?.id], resetContext, { flush: 'sync' })
// A directory permission change can invalidate previously visible identities.
watch(canSeePeople, resetContext, { flush: 'sync' })
void loadRoles()
await load()
</script>

<template>
  <section class="members-tab">
    <PageHeader title="Участники" description="Состав и роли в служении">
      <template #breadcrumbs><NuxtLink to="/ministries">Служения</NuxtLink><span aria-hidden="true">/</span><NuxtLink :to="`/ministries/${encodeURIComponent(ministryId)}`">Обзор служения</NuxtLink></template>
      <template #actions><button v-if="canAdd" type="button" class="ui-button ui-button--primary" data-test="add-member" @click="showAddDialog = true">Добавить участника</button></template>
    </PageHeader>
    <MinistryTabs :ministry-id="ministryId" />
    <label class="members-tab__search"><span>Найти участника</span><input v-model="search" type="search" data-test="member-search" placeholder="Имя или роль"></label>
    <p v-if="rolesError" role="alert">
      {{ rolesError }} <button type="button" data-test="retry-roles" @click="loadRoles">Повторить</button>
    </p>
    <AddMemberDialog
      v-if="showAddDialog && canAdd" :ministry-id="ministryId"
      @added="onAdded" @close="showAddDialog = false"
    />
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <p v-else-if="!members.length" role="status">В служении пока нет участников.</p>
    <p v-else-if="!filteredMembers.length" role="status">Участники не найдены. Попробуйте другое имя или роль.</p>
    <ul v-else class="members-tab__list" aria-label="Состав служения">
      <MemberRow
        v-for="member in filteredMembers" :key="member.id" :member="member" @open="selectedMember = $event"
      />
    </ul>
    <p v-if="members.length && !loading" class="members-tab__count" role="status">Показано {{ filteredMembers.length }} из {{ members.length }}</p>
    <MemberDetailsDialog v-if="selectedMember" :key="selectedMember.id" :member="selectedMember" :ministry-id="ministryId" :roles-catalogue="roles" :roles-loading="rolesLoading" :catalogue-error="rolesError" @retry-roles="loadRoles" @close="selectedMember = null" @removed="onRemoved" @roles-changed="onRolesChanged" />
  </section>
</template>

<style scoped>
.members-tab { width: 100%; min-width: 0; max-width: var(--ui-content-width); margin-inline: auto; color: var(--ui-text); }
.members-tab__search { display: grid; gap: var(--ui-space-2); width: min(100%, 24rem); margin-bottom: var(--ui-space-4); font-size: .875rem; color: var(--ui-text-muted); }
.members-tab__search input { width: 100%; max-width: 100%; }
.members-tab__list { list-style: none; padding: 0; margin: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); overflow: clip; }
.members-tab__count { color: var(--ui-text-muted); font-size: .875rem; }
button { max-width: 100%; overflow-wrap: anywhere; }
[role='alert'] { color: var(--ui-danger); }
</style>
