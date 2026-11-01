<script setup lang="ts">
import AddMemberDialog from '~/components/ministries/AddMemberDialog.vue'
import MemberRow from '~/components/ministries/MemberRow.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import type { Member, MinistryRole } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
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
const rolesError = ref('')
const loading = ref(false)
const errorMessage = ref('')
const showAddDialog = ref(false)
let requestVersion = 0
let rolesRequestVersion = 0

async function load() {
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: Member[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/members`)
    if (version === requestVersion) members.value = response.data
  } catch (error) {
    if (version !== requestVersion) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить состав. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function loadRoles() {
  if (!canManage.value) return
  const version = ++rolesRequestVersion
  rolesError.value = ''
  try {
    const response = await api.get<{ data: MinistryRole[] }>(`/ministries/${encodeURIComponent(ministryId.value)}/roles`)
    if (version === rolesRequestVersion) roles.value = response.data.map(role => ({ id: role.id, name: role.name }))
  } catch (error) {
    if (version === rolesRequestVersion) {
      rolesError.value = apiErrorMessage(error, 'Не удалось загрузить роли служения. Попробуйте ещё раз.')
    }
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

// Открытый диалог добавления теряет смысл, если members.manage или
// people.view сняли посреди сессии — сами MemberRow скрывают свои действия
// реактивно (canIn читается заново при каждом вызове, useCan.ts), здесь
// достаточно закрыть диалог добавления. Каталог ролей перечитывается, если
// право появилось посреди сессии, и очищается, если его сняли.
watch(canManage, (allowed) => {
  if (allowed) {
    void loadRoles()
  } else {
    roles.value = []
  }
})
watch(canAdd, (allowed) => { if (!allowed) showAddDialog.value = false })
// Nuxt переиспользует этот компонент страницы между служениями (переход по
// ссылке между /ministries/{id}/members меняет только route.params.id, не
// пересоздавая компонент) — открытый диалог добавления, найденный в старом
// служении, иначе остался бы открытым и добавил бы того человека уже в
// новое (review round 2, task 28). v-if пересоздаёт AddMemberDialog с нуля
// при следующем открытии, так что закрытия достаточно и для сброса его
// внутреннего состояния (поиска и результатов).
watch(() => route.params.id, () => {
  showAddDialog.value = false
  void Promise.all([load(), loadRoles()])
})
await Promise.all([load(), loadRoles()])
</script>

<template>
  <section class="members-tab">
    <MinistryTabs :ministry-id="ministryId" />
    <header>
      <h1>Участники</h1>
      <button v-if="canAdd" type="button" data-test="add-member" @click="showAddDialog = true">Добавить участника</button>
    </header>
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
    <ul v-else class="members-tab__list">
      <MemberRow
        v-for="member in members" :key="member.id" :member="member" :ministry-id="ministryId"
        :roles-catalogue="roles" @removed="onRemoved" @roles-changed="onRolesChanged"
      />
    </ul>
  </section>
</template>

<style scoped>
button { max-width: 100%; overflow-wrap: anywhere; }
.members-tab { max-width: 48rem; margin: 0 auto; color: var(--ui-text); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
h1 { margin: 0; }
.members-tab__list { list-style: none; padding: 0; margin: 0; }
button { font: inherit; padding: .625rem min(.875rem, 14px); cursor: pointer; background: var(--ui-accent); color: white; border: none; border-radius: var(--ui-radius-sm); }
[role='alert'] { color: var(--ui-danger); }
</style>
