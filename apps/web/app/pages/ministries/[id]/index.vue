<script setup lang="ts">
import PageHeader from '~/components/ui/PageHeader.vue'
import FormSection from '~/components/ui/FormSection.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi(), auth = useAuthStore()
const route = useRoute()
const { can, canIn } = useCan()
const ministryId = computed(() => String(route.params.id))
const canEdit = computed(() => canIn(ministryId.value, 'ministry.edit'))
const canArchive = computed(() => can('ministries.create'))
const ministry = ref<Ministry | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const editing = ref(false)
const name = ref('')
const description = ref('')
const saving = ref(false)
const saveError = ref('')
const confirmArchive = ref(false)
const archiving = ref(false)
const archiveError = ref('')
const nameInput = ref<HTMLInputElement>(), editButton = ref<HTMLButtonElement>(), heading = ref<HTMLElement>()
function focusName() {
  nameInput.value?.focus({ preventScroll: true })
  nameInput.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
let requestVersion = 0, editOperation = 0, archiveOperation = 0, active = true
onBeforeUnmount(() => { active = false; requestVersion++; editOperation++; archiveOperation++ })
function current(session: number, id: string) { return active && session === auth.sessionVersion && id === ministryId.value }
async function finishEditing() { editing.value = false; await nextTick(); editButton.value?.focus() }
function resetContext() { requestVersion++; editOperation++; archiveOperation++; ministry.value = null; editing.value = false; saving.value = false; archiving.value = false; name.value = ''; description.value = ''; saveError.value = ''; archiveError.value = ''; void load() }
watch([() => auth.sessionVersion, () => auth.user?.id], resetContext, { flush: 'sync' })
watch(canEdit, allowed => { if (!allowed) { editOperation++; editing.value = false; saving.value = false; name.value = ''; description.value = ''; saveError.value = '' } }, { flush: 'sync' })
watch(canArchive, allowed => { if (!allowed) { archiveOperation++; archiving.value = false; confirmArchive.value = false; archiveError.value = '' } }, { flush: 'sync' })

async function load() {
  const version = ++requestVersion, session = auth.sessionVersion
  loading.value = true
  errorMessage.value = ''
  editing.value = false
  confirmArchive.value = false
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

async function startEditing() {
  if (!ministry.value || ministry.value.archived_at || !canEdit.value) return
  name.value = ministry.value.name
  description.value = ministry.value.description ?? ''
  saveError.value = ''
  editing.value = true
  await nextTick(); focusName()
}

async function save() {
  if (saving.value || archiving.value || !canEdit.value || ministry.value?.archived_at) return
  if (!name.value.trim()) {
    saveError.value = 'Заполните название.'
    focusName()
    return
  }
  const token = ++editOperation, session = auth.sessionVersion, id = ministryId.value
  saving.value = true
  saveError.value = ''
  try {
    const response = await api.patch<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`, {
      name: name.value.trim(),
      description: description.value.trim() || null,
    })
    if (!(token === editOperation && current(session, id)) || !canEdit.value) return
    ministry.value = response.data
    await finishEditing()
  } catch (error) {
    if ((token === editOperation && current(session, id)) && canEdit.value) saveError.value = apiErrorMessage(error, 'Не удалось сохранить служение. Попробуйте ещё раз.')
  } finally {
    if ((token === editOperation && current(session, id))) saving.value = false
  }
}

async function archive() {
  if (archiving.value || saving.value || !confirmArchive.value || !canArchive.value || ministry.value?.archived_at) return
  const token = ++archiveOperation, session = auth.sessionVersion, id = ministryId.value
  archiving.value = true
  archiveError.value = ''
  try {
    const response = await api.post<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}/archive`)
    if (!(token === archiveOperation && current(session, id)) || !canArchive.value) return
    ministry.value = response.data
    confirmArchive.value = false
    await nextTick(); heading.value?.focus()
  } catch (error) {
    if ((token === archiveOperation && current(session, id)) && canArchive.value) archiveError.value = apiErrorMessage(error, 'Не удалось архивировать служение. Попробуйте ещё раз.')
  } finally {
    if ((token === archiveOperation && current(session, id))) archiving.value = false
  }
}

// Обложка — тем же загрузчиком, что и фото: привязать можно только
// обработанный файл. Ответ `PUT /ministries/{id}/cover` — обновлённое
// служение с новой `cover_url`.
function onCoverAttached(updated: Ministry) {
  if (updated.id === ministryId.value && canEdit.value) ministry.value = updated
}

watch(() => route.params.id, resetContext, { flush: 'sync' })
await load()
</script>

<template>
  <section class="ministry-card">

    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button type="button" data-test="retry-ministry" @click="load">Повторить</button>
    </p>
    <template v-if="ministry">
      <PageHeader :title="ministry.name">
        <template #breadcrumbs><NuxtLink to="/ministries">К списку служений</NuxtLink></template>
      </PageHeader>
      <p v-if="ministry.archived_at" ref="heading" tabindex="-1" class="notice">В архиве</p>
      <MinistryTabs :ministry-id="ministryId" :chat-id="ministry.chat_id" />
      <img v-if="ministry.cover_url" class="ministry-card__cover" :src="ministry.cover_url" :alt="`Обложка: ${ministry.name}`" data-test="ministry-cover">

      <template v-if="editing && canEdit">
        <form @submit.prevent="save">
          <FormSection title="Данные служения">
          <fieldset :disabled="saving">
            <legend class="visually-hidden">Данные служения</legend>
            <label>
              Название
              <input ref="nameInput" v-model="name" name="name" type="text" maxlength="100" required :aria-describedby="saveError ? 'edit-ministry-error' : undefined">
            </label>
            <label>
              Описание
              <textarea v-model="description" name="description" rows="3" />
            </label>
          </fieldset>
          </FormSection>
          <p v-if="saveError" id="edit-ministry-error" role="alert">{{ saveError }}</p>
          <button type="submit" class="ui-button ui-button--primary" data-test="save-ministry" :disabled="saving">Сохранить</button>
          <button type="button" data-test="cancel-edit-ministry" :disabled="saving" @click="finishEditing">Отмена</button>
        </form>
      </template>
      <template v-else>
        <p v-if="ministry.description">{{ ministry.description }}</p>
        <p v-else>Описание не заполнено.</p>
        <button
          v-if="canEdit" ref="editButton" type="button" class="ui-button ui-button--secondary" data-test="edit-ministry" :disabled="!!ministry.archived_at || archiving"
          :title="ministry.archived_at ? 'Сначала архивное служение нужно вернуть на сервере.' : ''"
          @click="startEditing"
        >Редактировать</button>
      </template>
      <section v-if="canEdit">
        <h2>Обложка</h2>
        <!-- Ключ по служению: загрузка, начатая в одном служении, не
             привяжет файл к другому, если экран переиспользован для
             следующего адреса. -->
        <MediaUploader
          :key="ministryId" purpose="ministry_cover" :target="`/ministries/${encodeURIComponent(ministryId)}/cover`"
          label="Изменить обложку" :disabled="!!ministry.archived_at"
          disabled-reason="Архивное служение изменить нельзя." @attached="onCoverAttached"
        />
      </section>
      <section v-if="canArchive && !ministry.archived_at">
        <h2>Архивация</h2>
        <button v-if="!confirmArchive" type="button" data-test="archive" :disabled="saving" @click="confirmArchive = true">Архивировать</button>
        <div v-else role="group" aria-label="Подтверждение архивации" class="notice">
          <p>Архивировать служение? Оно исчезнет из активного списка, история сохранится.</p>
          <button type="button" data-test="confirm-archive" :disabled="archiving" @click="archive">Подтвердить архивацию</button>
          <button type="button" data-test="cancel-archive" :disabled="archiving" @click="confirmArchive = false">Отмена</button>
        </div>
        <p v-if="archiveError" role="alert">{{ archiveError }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.ministry-card { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
.ministry-card__cover { display: block; width: 100%; max-height: 16rem; object-fit: cover; border-radius: var(--ui-radius-sm); margin-bottom: var(--ui-space-3); }
.ministry-card > section { border-top: 1px solid var(--ui-border); margin-top: var(--ui-space-6); padding-top: var(--ui-space-4); }
label { display: flex; flex-direction: column; gap: var(--ui-space-1); margin-bottom: var(--ui-space-4); }
input, textarea, button { font: inherit; padding: 0.65rem min(0.65rem, 10px); border: 1px solid var(--ui-border-strong); border-radius: var(--ui-radius-sm); }
button { cursor: pointer; margin-right: min(var(--ui-space-2), 8px); }
button:disabled { opacity: 0.6; cursor: wait; }
.notice { background: var(--ui-surface-muted); padding: min(var(--ui-space-4), 16px); border-radius: var(--ui-radius-sm); margin-top: var(--ui-space-4); }
[role='alert'] { color: var(--ui-danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

fieldset { min-width: 0; border: 0; padding: 0; margin: 0; } input, textarea { width: 100%; max-width: 100%; } button { max-width: 100%; }
@media (max-width: 767px) {
  .ministry-card { padding-inline: 0; border: 0; box-shadow: none; }
}
</style>
