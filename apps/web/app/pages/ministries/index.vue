<script setup lang="ts">
import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

const api = useApi()
const { can } = useCan()
const canCreate = computed(() => can('ministries.create'))
const ministries = ref<Ministry[]>([])
const loading = ref(false)
const errorMessage = ref('')
const showForm = ref(false)
const name = ref('')
const description = ref('')
const saving = ref(false)
const formError = ref('')
// Название созданного служения, которого нет в списке смотрящего: создатель
// не становится участником (docs/architecture.md, 7.3), а без
// ministries.view_all сервер список ему не отдаёт.
const createdHidden = ref<string | null>(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get<{ data: Ministry[] }>('/ministries')
    ministries.value = response.data
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить служения. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (saving.value || !canCreate.value) return
  if (!name.value.trim()) {
    formError.value = 'Заполните название.'
    return
  }
  saving.value = true
  formError.value = ''
  createdHidden.value = null
  try {
    const created = await api.post<{ data: Ministry }>('/ministries', {
      name: name.value.trim(), description: description.value.trim() || null,
    })
    name.value = ''
    description.value = ''
    showForm.value = false
    await load()
    if (!errorMessage.value && !ministries.value.some(item => item.id === created.data.id)) {
      createdHidden.value = created.data.name
    }
  } catch (error) {
    formError.value = apiErrorMessage(error, 'Не удалось создать служение. Попробуйте ещё раз.')
  } finally {
    saving.value = false
  }
}

watch(canCreate, (allowed) => { if (!allowed) showForm.value = false })
await load()
</script>

<template>
  <section class="ministries-page">
    <header>
      <h1>Служения</h1>
      <button v-if="canCreate && !showForm" type="button" data-test="create-ministry" @click="showForm = true; createdHidden = null">Создать служение</button>
    </header>
    <form v-if="showForm && canCreate" class="ministries-page__form" @submit.prevent="submit">
      <fieldset :disabled="saving">
        <legend>Новое служение</legend>
        <label>
          Название
          <input v-model="name" type="text" maxlength="100" required data-test="ministry-name">
        </label>
        <label>
          Описание
          <textarea v-model="description" rows="3" data-test="ministry-description" />
        </label>
      </fieldset>
      <p v-if="formError" role="alert">{{ formError }}</p>
      <button type="submit" data-test="save-ministry" :disabled="saving">Создать</button>
      <button type="button" data-test="cancel-ministry" :disabled="saving" @click="showForm = false">Отмена</button>
    </form>
    <p v-if="createdHidden" role="status" class="ministries-page__notice" data-test="created-hidden">
      Служение «{{ createdHidden }}» создано. В вашем списке его нет: вы не состоите в нём и не имеете права
      «Видеть все служения». Оно появится здесь, когда вас добавят в его состав или выдадут роль с этим правом.
    </p>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <p v-else-if="!ministries.length" role="status">Служения ещё не созданы.</p>
    <ul v-else class="ministries-page__list">
      <li v-for="ministry in ministries" :key="ministry.id">
        <NuxtLink :to="`/ministries/${ministry.id}`" class="ministries-page__item">
          <img v-if="ministry.cover_url" :src="ministry.cover_url" :alt="`Обложка: ${ministry.name}`" loading="lazy">
          <span v-else class="ministries-page__placeholder" aria-hidden="true">{{ ministry.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ ministry.name }}</strong>
            <p v-if="ministry.description">{{ ministry.description }}</p>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ministries-page { min-width: 0; width: 100%; max-width: var(--ui-content-width); margin-inline: auto; overflow-wrap: anywhere; }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-4); margin-bottom: var(--ui-space-6); }
h1 { margin: 0; }
header button { background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
.ministries-page__form { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: min(var(--ui-space-4), 16px); margin-bottom: var(--ui-space-6); }
.ministries-page__form fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
label { display: flex; flex-direction: column; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); }
input, textarea { width: 100%; max-width: 100%; }
button { max-width: 100%; margin: var(--ui-space-1) var(--ui-space-2) var(--ui-space-1) 0; }
.ministries-page__notice { padding: min(var(--ui-space-4), 16px); margin-bottom: var(--ui-space-4); background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); }
.ministries-page__list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--ui-space-3); }
.ministries-page__item { display: flex; align-items: center; gap: var(--ui-space-4); padding: min(var(--ui-space-4), 16px); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); color: inherit; text-decoration: none; }
.ministries-page__item:hover { border-color: var(--ui-accent); }
.ministries-page__item > div { min-width: 0; flex: 1; }
.ministries-page__item p { color: var(--ui-text-muted); margin-bottom: 0; }
.ministries-page__item img, .ministries-page__placeholder { width: 56px; height: 56px; border-radius: var(--ui-radius-sm); object-fit: cover; flex-shrink: 0; }
.ministries-page__placeholder { display: grid; place-items: center; background: var(--ui-accent-soft); color: var(--ui-accent); font-weight: 600; }
</style>
