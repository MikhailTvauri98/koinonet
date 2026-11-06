<script setup lang="ts">
import UiDialog from '~/components/ui/UiDialog.vue'
import { pluralizeCarriers, type RoleLike, type RoleUsage } from '~/utils/roles'
import { apiErrorMessage } from '~/utils/apiError'

const props = defineProps<{ role: RoleLike }>()
const emit = defineEmits<{ deleted: [roleId: string], close: [] }>()
const api = useApi()
const heading = ref<HTMLElement>()
const auth = useAuthStore()
const session = auth.sessionVersion
const valid = () => active && auth.sessionVersion === session
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
    if (valid()) usage.value = response.data
  } catch (error) {
    if (valid()) loadErrorMessage.value = apiErrorMessage(error, 'Не удалось проверить использование роли. Попробуйте ещё раз.')
  } finally {
    if (valid()) loading.value = false
  }
}

async function confirmDelete() {
  // Кнопка «Подтвердить удаление» существует только когда blockers пуст
  // (шаблон ниже) — но usage может устареть между загрузкой и кликом, а
  // повторный клик посреди запроса не должен уйти вторым запросом.
  if (!valid() || deleting.value || !usage.value || usage.value.blockers.length) return
  deleting.value = true
  deleteErrorMessage.value = ''
  try {
    await api.delete(`/roles/${encodeURIComponent(props.role.id)}`)
    if (valid()) emit('deleted', props.role.id)
  } catch (error) {
    if (valid()) deleteErrorMessage.value = apiErrorMessage(error, 'Не удалось удалить роль. Попробуйте ещё раз.')
  } finally {
    if (valid()) deleting.value = false
  }
}

function close() {
  if (deleting.value) return
  emit('close')
}

onMounted(async () => {
  await loadUsage()
  await nextTick()
  if (valid()) heading.value?.focus()
})
</script>

<template>
  <UiDialog :open="true" :label="`Удалить роль «${role.name}»?`" @close="close">
    <h2 ref="heading" tabindex="-1">Удалить роль?</h2>
    <p>Роль «{{ role.name }}».</p>
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

      </template>
      <template v-else>
        <p v-if="deleteErrorMessage" role="alert">{{ deleteErrorMessage }}</p>

      </template>
    </template>
    <template #actions>
      <button v-if="usage && !usage.blockers.length && !loading && !loadErrorMessage" type="button" class="ui-button ui-button--danger" data-test="confirm-delete" :disabled="deleting" @click="confirmDelete">{{ deleting ? 'Удаление…' : 'Подтвердить удаление' }}</button>
      <button type="button" class="ui-button" :data-test="usage && !usage.blockers.length ? 'cancel-delete' : 'close-usage'" :disabled="deleting" @click="close">{{ usage && !usage.blockers.length ? 'Отмена' : 'Закрыть' }}</button>
    </template>
  </UiDialog>
</template>

<style scoped>
ul { padding-left: var(--ui-space-4); }
</style>
