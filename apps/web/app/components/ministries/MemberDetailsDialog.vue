<script setup lang="ts">
import type { Member } from '~/utils/ministries'
import UiDialog from '~/components/ui/UiDialog.vue'
import type { Person } from '~/utils/people'
import { isDirectChatTarget, useDirectChatNavigation } from '~/composables/useStartDirectChat'
import { apiErrorMessage } from '~/utils/apiError'
const props = defineProps<{ member: Member, ministryId: string, rolesCatalogue: { id: string, name: string }[], rolesLoading?: boolean, catalogueError?: string }>()
const emit = defineEmits<{ removed: [memberId: string], rolesChanged: [member: Member], close: [], retryRoles: [] }>()
const api = useApi(), auth = useAuthStore(), { canIn, can } = useCan()
const canManage = computed(() => canIn(props.ministryId, 'members.manage'))
const opened = ref(true), selectedRoleIds = ref(props.member.roles.map(role => role.id))
const savingRoles = ref(false), rolesError = ref(''), rolesSaved = ref(false)
const confirmRemove = ref(false), removing = ref(false), removeError = ref('')
const rolesField = ref<HTMLFieldSetElement>()
const direct = useDirectChatNavigation(() => `${props.ministryId}:${props.member.id}:${opened.value}`)
const resolvingAccount = ref(false), accountError = ref(''), directUserId = ref('')
const canWrite = computed(() => can('people.view') && can('chats.dm') && props.member.person_id !== auth.person?.id)
const directBusy = computed(() => resolvingAccount.value || direct.pending.value)
let active = true, accountGeneration = 0
async function write() {
  if (!active || !canWrite.value || directBusy.value || savingRoles.value || removing.value) return
  const session = auth.sessionVersion, memberId = props.member.id, token = ++accountGeneration
  const current = () => active && token === accountGeneration && session === auth.sessionVersion && memberId === props.member.id && canWrite.value
  accountError.value = ''
  if (!directUserId.value) {
    resolvingAccount.value = true
    try {
      const result = await api.get<{ data: Person }>(`/people/${encodeURIComponent(props.member.person_id)}`)
      if (!current()) return
      if (result.data.id !== props.member.person_id || !isDirectChatTarget(result.data, auth.user?.id)) {
        accountError.value = 'Нет доступного аккаунта для личного чата.'; return
      }
      directUserId.value = result.data.user_id!
    } catch (failure) {
      if (current()) accountError.value = apiErrorMessage(failure, 'Не удалось получить аккаунт человека. Попробуйте ещё раз.')
    } finally { if (current()) resolvingAccount.value = false }
  }
  if (current() && directUserId.value) await direct.open(directUserId.value)
}
watch(canWrite, allowed => { if (!allowed) { accountGeneration++; directUserId.value = ''; accountError.value = ''; resolvingAccount.value = false } }, { flush: 'sync' })
function close() { if (!opened.value) return; opened.value = false; active = false; emit('close') }
function requestClose() { if (!savingRoles.value && !removing.value && !directBusy.value) close() }
watch([() => props.ministryId, () => props.member.id, () => auth.sessionVersion, () => auth.user?.id], close, { flush: 'sync' })
watch(canManage, (allowed, previous) => { if (previous && !allowed) close() }, { flush: 'sync' })
onBeforeUnmount(() => { active = false })
function current(session: number, ministryId: string, memberId: string) {
  return active && canManage.value && auth.sessionVersion === session && props.ministryId === ministryId && props.member.id === memberId
}
async function saveRoles() {
  if (directBusy.value || savingRoles.value || removing.value || props.rolesLoading || props.catalogueError || !props.rolesCatalogue.length || !canManage.value || !active) return
  rolesError.value = ''; rolesSaved.value = false
  if (!selectedRoleIds.value.length) {
    rolesError.value = 'Нельзя снять последнюю роль. Выберите хотя бы одну роль.'
    await nextTick(); rolesField.value?.querySelector('input')?.focus()
    return
  }
  const session = auth.sessionVersion, ministryId = props.ministryId, memberId = props.member.id
  savingRoles.value = true
  try {
    const response = await api.put<{ data: Member }>(`/ministries/${encodeURIComponent(ministryId)}/members/${encodeURIComponent(memberId)}/roles`, { role_ids: [...selectedRoleIds.value] })
    if (!current(session, ministryId, memberId)) return
    selectedRoleIds.value = response.data.roles.map(role => role.id)
    rolesSaved.value = true
    emit('rolesChanged', response.data)
  } catch (error) {
    if (current(session, ministryId, memberId)) rolesError.value = apiErrorMessage(error, 'Не удалось сохранить роли. Попробуйте ещё раз.')
  } finally { if (current(session, ministryId, memberId)) savingRoles.value = false }
}
async function remove() {
  if (directBusy.value || removing.value || savingRoles.value || !confirmRemove.value || !canManage.value || !active) return
  const session = auth.sessionVersion, ministryId = props.ministryId, memberId = props.member.id
  removing.value = true; removeError.value = ''
  try {
    await api.delete(`/ministries/${encodeURIComponent(ministryId)}/members/${encodeURIComponent(memberId)}`)
    if (!current(session, ministryId, memberId)) return
    emit('removed', memberId); close()
  } catch (error) {
    if (current(session, ministryId, memberId)) removeError.value = apiErrorMessage(error, 'Не удалось исключить участника. Попробуйте ещё раз.')
  } finally { if (current(session, ministryId, memberId)) removing.value = false }
}
</script>

<template>
  <UiDialog :open="opened" label="Участник служения" @close="requestClose">
    <template v-if="opened">
      <h2>{{ member.full_name || 'Имя скрыто' }}</h2>
      <img v-if="member.photo_url" :src="member.photo_url" alt="Фото участника" class="member-details__photo" width="64" height="64">
      <ul class="member-details__current" aria-label="Текущие роли участника"><li v-for="role in member.roles" :key="role.id">{{ role.name }}</li></ul>
      <button v-if="canWrite" type="button" class="ui-button ui-button--primary" data-test="write-member" :disabled="directBusy || savingRoles || removing" @click="write">{{ direct.confirmedId.value ? 'Открыть чат' : directBusy ? 'Открываем чат…' : 'Написать' }}</button>
      <p v-if="accountError || direct.error.value" role="alert">{{ accountError || direct.error.value }}</p>
      <template v-if="canManage">
        <p v-if="rolesLoading" role="status">Загрузка ролей служения…</p>
        <p v-else-if="catalogueError" role="alert">{{ catalogueError }} <button type="button" data-test="retry-member-roles" @click="emit('retryRoles')">Повторить</button></p>
        <fieldset ref="rolesField" class="member-details__roles" :disabled="directBusy || savingRoles || removing || rolesLoading || !!catalogueError" :aria-describedby="rolesError ? 'member-roles-error' : undefined" @change="rolesSaved = false">
          <legend>Роли в служении</legend>
          <p class="member-details__hint">У участника должна оставаться хотя бы одна роль.</p>
          <label v-for="role in rolesCatalogue" :key="role.id">
            <input v-model="selectedRoleIds" type="checkbox" :value="role.id" :data-test="`role-${role.id}`" :aria-describedby="rolesError ? 'member-roles-error' : undefined"> <span>{{ role.name }}</span>
          </label>
        </fieldset>
        <p v-if="rolesError" id="member-roles-error" role="alert">{{ rolesError }}</p>
        <p v-if="rolesSaved" role="status">Роли сохранены.</p>
        <button type="button" class="ui-button ui-button--primary" data-test="save-roles" :disabled="directBusy || savingRoles || removing || rolesLoading || !!catalogueError || !rolesCatalogue.length" @click="saveRoles">{{ savingRoles ? 'Сохранение…' : 'Сохранить роли' }}</button>
        <section class="member-details__remove">
          <h3>Участие в служении</h3>
          <button v-if="!confirmRemove" type="button" class="ui-button ui-button--danger" data-test="remove-member" :disabled="directBusy || savingRoles" @click="confirmRemove = true">Исключить</button>
          <div v-else role="group" aria-label="Подтверждение исключения участника">
            <p>Исключить участника из служения?</p>
            <div class="member-details__actions">
              <button type="button" class="ui-button ui-button--danger" data-test="confirm-remove-member" :disabled="directBusy || removing || savingRoles" @click="remove">{{ removing ? 'Исключение…' : 'Подтвердить' }}</button>
              <button type="button" class="ui-button ui-button--secondary" data-test="cancel-remove-member" :disabled="directBusy || removing" @click="confirmRemove = false">Отмена</button>
            </div>
          </div>
          <p v-if="removeError" role="alert">{{ removeError }}</p>
        </section>
      </template>

    </template>
    <template #actions><button type="button" class="ui-button ui-button--secondary" data-test="close-member" :disabled="savingRoles || removing || directBusy" @click="requestClose">Закрыть</button></template>
  </UiDialog>
</template>

<style scoped>
.member-details__current { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); list-style: none; padding: 0 !important; margin-block: var(--ui-space-4); color: var(--ui-text-muted); font-size: .875rem; }
.member-details__current li { padding: var(--ui-space-1) var(--ui-space-2); background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); }
.member-details__photo { border-radius: 50%; object-fit: cover; margin-bottom: var(--ui-space-4); }
.member-details__roles { border: 0; padding: 0; margin: 0 0 var(--ui-space-4); min-width: 0; }
.member-details__roles legend { font-weight: 600; }
.member-details__roles label { display: flex; align-items: flex-start; gap: var(--ui-space-3); min-height: 44px; padding-block: var(--ui-space-2); overflow-wrap: anywhere; }
.member-details__roles input { flex-shrink: 0; margin-top: .3em; }
.member-details__hint { color: var(--ui-text-muted); font-size: .875rem; }
.member-details__remove { border-top: 1px solid var(--ui-border); margin-top: var(--ui-space-6); padding-top: var(--ui-space-4); }
.member-details__remove h3 { margin-top: 0; font-size: 1rem; }
.member-details__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
[role='alert'] { color: var(--ui-danger); }
</style>
