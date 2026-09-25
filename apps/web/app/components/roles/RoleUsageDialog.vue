<script setup lang="ts">
import { pluralizeCarriers, rolesErrorMessage, type RoleLike, type RoleUsage } from '~/utils/roles'

const props = defineProps<{ role: RoleLike }>()
const emit = defineEmits<{ deleted: [roleId: string], close: [] }>()
const api = useApi()
const dialog = ref<HTMLDialogElement>()
const loading = ref(true)
const loadErrorMessage = ref('')
const usage = ref<RoleUsage | null>(null)
const deleting = ref(false)
const deleteErrorMessage = ref('')
// Тот же приём, что у AddMemberDialog.vue: диалог или сама карточка могут
// уйти, пока запрос ещё летит — не пишем в состояние и не эмитим наружу
// после размонтирования.
let active = true
onBeforeUnmount(() => { active = false })

async function loadUsage() {
  loading.value = true
  loadErrorMessage.value = ''
  try {
    const response = await api.get<{ data: RoleUsage }>(`/roles/${encodeURIComponent(props.role.id)}/usage`)
    if (active) usage.value = response.data
  } catch (error) {
    if (active) loadErrorMessage.value = rolesErrorMessage(error, 'Не удалось проверить использование роли. Попробуйте ещё раз.')
  } finally {
    if (active) loading.value = false
  }
}

async function confirmDelete() {
  // Кнопка «Подтвердить удаление» существует только когда blockers пуст
  // (шаблон ниже) — но usage может устареть между загрузкой и кликом, а
  // повторный клик посреди запроса не должен уйти вторым запросом.
  if (deleting.value || !usage.value || usage.value.blockers.length) return
  deleting.value = true
  deleteErrorMessage.value = ''
  try {
    await api.delete(`/roles/${encodeURIComponent(props.role.id)}`)
    if (active) emit('deleted', props.role.id)
  } catch (error) {
    if (active) deleteErrorMessage.value = rolesErrorMessage(error, 'Не удалось удалить роль. Попробуйте ещё раз.')
  } finally {
    if (active) deleting.value = false
  }
}

function close() {
  dialog.value?.close()
  emit('close')
}

onMounted(() => {
  dialog.value?.showModal()
  void loadUsage()
})
</script>

<template>
  <dialog ref="dialog" aria-labelledby="role-usage-title" @cancel.prevent="close">
    <h2 id="role-usage-title">Удалить роль «{{ role.name }}»?</h2>
    <p v-if="loading" role="status">Проверяем использование…</p>
    <p v-else-if="loadErrorMessage" role="alert">
      {{ loadErrorMessage }} <button type="button" data-test="retry-usage" @click="loadUsage">Повторить</button>
    </p>
    <template v-else-if="usage">
      <p>Сейчас роль у {{ usage.carriers }} {{ pluralizeCarriers(usage.carriers) }}.</p>
      <template v-if="usage.blockers.length">
        <p>Удалить нельзя, пока не устранены причины:</p>
        <ul>
          <li v-for="blocker in usage.blockers" :key="`${blocker.type}-${blocker.id}`">{{ blocker.title }}</li>
        </ul>
        <button type="button" data-test="close-usage" @click="close">Понятно</button>
      </template>
      <template v-else>
        <p v-if="deleteErrorMessage" role="alert">{{ deleteErrorMessage }}</p>
        <button type="button" data-test="confirm-delete" :disabled="deleting" @click="confirmDelete">Подтвердить удаление</button>
        <button type="button" data-test="cancel-delete" :disabled="deleting" @click="close">Отмена</button>
      </template>
    </template>
  </dialog>
</template>

<style scoped>
dialog { width: min(28rem, calc(100% - 4rem)); border: 1px solid #8b96a6; border-radius: 0.5rem; padding: 1.5rem; }
dialog::backdrop { background: #17213399; }
button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; cursor: pointer; margin-right: 0.5rem; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
ul { padding-left: 1.2rem; }
</style>
