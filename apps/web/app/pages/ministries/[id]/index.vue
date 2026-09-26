<script setup lang="ts">
import MediaUploader from '~/components/MediaUploader.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
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
let requestVersion = 0

async function load() {
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''
  editing.value = false
  confirmArchive.value = false
  try {
    const response = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`)
    if (version !== requestVersion) return
    ministry.value = response.data
  } catch (error) {
    if (version !== requestVersion) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить служение. Попробуйте ещё раз.')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function startEditing() {
  if (!ministry.value) return
  name.value = ministry.value.name
  description.value = ministry.value.description ?? ''
  saveError.value = ''
  editing.value = true
}

async function save() {
  if (saving.value || !canEdit.value) return
  if (!name.value.trim()) {
    saveError.value = 'Заполните название.'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const response = await api.patch<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}`, {
      name: name.value.trim(),
      description: description.value.trim() || null,
    })
    ministry.value = response.data
    editing.value = false
  } catch (error) {
    saveError.value = apiErrorMessage(error, 'Не удалось сохранить служение. Попробуйте ещё раз.')
  } finally {
    saving.value = false
  }
}

async function archive() {
  if (archiving.value || !canArchive.value) return
  archiving.value = true
  archiveError.value = ''
  try {
    const response = await api.post<{ data: Ministry }>(`/ministries/${encodeURIComponent(ministryId.value)}/archive`)
    ministry.value = response.data
    confirmArchive.value = false
  } catch (error) {
    archiveError.value = apiErrorMessage(error, 'Не удалось архивировать служение. Попробуйте ещё раз.')
  } finally {
    archiving.value = false
  }
}

// Обложка — тем же загрузчиком, что и фото: привязать можно только
// обработанный файл. Ответ `PUT /ministries/{id}/cover` — обновлённое
// служение с новой `cover_url`.
function onCoverAttached(updated: Ministry) {
  ministry.value = updated
}

watch(() => route.params.id, () => { void load() })
await load()
</script>

<template>
  <section class="ministry-card">
    <NuxtLink to="/ministries">К списку служений</NuxtLink>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button type="button" data-test="retry-ministry" @click="load">Повторить</button>
    </p>
    <template v-if="ministry">
      <MinistryTabs :ministry-id="ministryId" />
      <header>
        <img v-if="ministry.cover_url" :src="ministry.cover_url" :alt="`Обложка: ${ministry.name}`" data-test="ministry-cover">
        <h1>{{ ministry.name }}</h1>
      </header>
      <p v-if="ministry.archived_at" class="notice">В архиве</p>
      <template v-if="editing && canEdit">
        <form @submit.prevent="save">
          <fieldset :disabled="saving">
            <legend class="visually-hidden">Данные служения</legend>
            <label>
              Название
              <input v-model="name" name="name" type="text" maxlength="100" required>
            </label>
            <label>
              Описание
              <textarea v-model="description" name="description" rows="3" />
            </label>
          </fieldset>
          <p v-if="saveError" role="alert">{{ saveError }}</p>
          <button type="submit" data-test="save-ministry" :disabled="saving">Сохранить</button>
          <button type="button" data-test="cancel-edit-ministry" :disabled="saving" @click="editing = false">Отмена</button>
        </form>
      </template>
      <template v-else>
        <p v-if="ministry.description">{{ ministry.description }}</p>
        <p v-else>Описание не заполнено.</p>
        <button
          v-if="canEdit" type="button" data-test="edit-ministry" :disabled="!!ministry.archived_at"
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
        <button v-if="!confirmArchive" type="button" data-test="archive" @click="confirmArchive = true">Архивировать</button>
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
.ministry-card { max-width: 48rem; margin: 0 auto; color: #202b3a; overflow-wrap: anywhere; }
header { margin: 1rem 0; }
header img { display: block; width: 100%; max-height: 16rem; object-fit: cover; border-radius: 0.5rem; margin-bottom: 0.75rem; }
h1 { margin: 0; }
.ministry-card > section { border-top: 1px solid #d8dce2; margin-top: 1.5rem; padding-top: 1rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
input, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; margin-right: 0.5rem; }
button:disabled { opacity: 0.6; cursor: wait; }
.notice { background: #edf1f6; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; }
[role='alert'] { color: #a32020; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
