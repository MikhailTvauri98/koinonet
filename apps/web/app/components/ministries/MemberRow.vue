<script setup lang="ts">
import type { Member } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{
  member: Member
  ministryId: string
  rolesCatalogue: { id: string, name: string }[]
}>()
const emit = defineEmits<{ removed: [memberId: string], rolesChanged: [member: Member] }>()
const api = useApi()
const { canIn } = useCan()
const canManage = computed(() => canIn(props.ministryId, 'members.manage'))
const selectedRoleIds = ref<string[]>(props.member.roles.map(role => role.id))
const savingRoles = ref(false)
const rolesError = ref('')
const confirmRemove = ref(false)
const removing = ref(false)
const removeError = ref('')

watch(() => props.member.roles, (roles) => {
  selectedRoleIds.value = roles.map(role => role.id)
})

async function saveRoles() {
  if (savingRoles.value || !canManage.value) return
  savingRoles.value = true
  rolesError.value = ''
  try {
    const response = await api.put<{ data: Member }>(
      `/ministries/${encodeURIComponent(props.ministryId)}/members/${encodeURIComponent(props.member.id)}/roles`,
      { role_ids: [...selectedRoleIds.value] },
    )
    emit('rolesChanged', response.data)
  } catch (error) {
    rolesError.value = apiErrorMessage(error, 'Не удалось сохранить роли. Попробуйте ещё раз.')
  } finally {
    savingRoles.value = false
  }
}

async function remove() {
  if (removing.value || !canManage.value) return
  removing.value = true
  removeError.value = ''
  try {
    await api.delete(`/ministries/${encodeURIComponent(props.ministryId)}/members/${encodeURIComponent(props.member.id)}`)
    emit('removed', props.member.id)
  } catch (error) {
    removeError.value = apiErrorMessage(error, 'Не удалось исключить участника. Попробуйте ещё раз.')
    confirmRemove.value = false
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <li class="member-row" data-test="member-row">
    <img v-if="member.photo_url" :src="member.photo_url" :alt="`Фото: ${member.full_name}`" width="48" height="48" loading="lazy">
    <span v-else class="member-row__placeholder" aria-hidden="true">{{ member.full_name?.slice(0, 1) || '?' }}</span>
    <div class="member-row__body">
      <!-- Сервер отдаёт full_name только тем, кому видна базовая карточка
           человека (people.view или сам человек) — тому же кругу, что и
           photo_url (review round 2, task 28). Без права — нейтральная
           надпись вместо пустой строки, не объясняющая причину. -->
      <strong v-if="member.full_name">{{ member.full_name }}</strong>
      <strong v-else class="member-row__hidden-name">Имя скрыто</strong>
      <ul class="member-row__chips" aria-label="Роли участника">
        <li v-for="role in member.roles" :key="role.id" class="member-row__chip">{{ role.name }}</li>
        <li v-if="!member.roles.length">Без ролей</li>
      </ul>
      <template v-if="canManage">
        <div class="member-row__roles">
          <fieldset :disabled="savingRoles">
            <legend class="visually-hidden">Роли участника в служении</legend>
            <label v-for="role in rolesCatalogue" :key="role.id">
              <input v-model="selectedRoleIds" type="checkbox" :value="role.id" :data-test="`role-${role.id}`"> {{ role.name }}
            </label>
          </fieldset>
          <button type="button" class="primary" data-test="save-roles" :disabled="savingRoles" @click="saveRoles">Сохранить роли</button>
          <p v-if="rolesError" role="alert">{{ rolesError }}</p>
        </div>
        <button v-if="!confirmRemove" type="button" class="danger" data-test="remove-member" @click="confirmRemove = true">Исключить</button>
        <div v-else role="group" aria-label="Подтверждение исключения участника">
          <p>Исключить участника из служения?</p>
          <button type="button" class="danger" data-test="confirm-remove-member" :disabled="removing" @click="remove">Подтвердить</button>
          <button type="button" data-test="cancel-remove-member" :disabled="removing" @click="confirmRemove = false">Отмена</button>
        </div>
        <p v-if="removeError" role="alert">{{ removeError }}</p>
      </template>
    </div>
  </li>
</template>

<style scoped>
.primary { background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
button { max-width: 100%; overflow-wrap: anywhere; }

.member-row { display: flex; align-items: flex-start; gap: 0.75rem; padding: min(var(--ui-space-4), 16px); margin-bottom: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); overflow-wrap: anywhere; }
.member-row img, .member-row__placeholder { width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.member-row__placeholder { display: grid; place-items: center; background: var(--ui-surface-muted); color: var(--ui-text-muted); }
.member-row__body { flex: 1; min-width: 0; }
.member-row__hidden-name { color: var(--ui-text-muted); font-weight: 400; font-style: italic; }
.member-row__chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0; margin: 0.4rem 0; }
.member-row__chip { padding: 0 0.5rem; border-radius: 1rem; background: var(--ui-surface-muted); font-size: 0.875rem; }
.member-row__roles fieldset { border: 0; padding: 0; margin: 0.5rem 0; display: flex; flex-wrap: wrap; gap: 0.75rem; }
.member-row__roles input { flex-shrink: 0; margin-top: .3em; }
.member-row__roles label { display: flex; align-items: flex-start; gap: var(--ui-space-2); min-width: 0; max-width: 100%; }
button { font: inherit; padding: 0.5rem 0.65rem; margin: 0.3rem 0.5rem 0.3rem 0; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: var(--ui-danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 480px) { .member-row { flex-direction: column; } .member-row__body { width: 100%; } }
</style>
