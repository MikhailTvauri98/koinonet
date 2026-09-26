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
  try {
    await api.post('/ministries', { name: name.value.trim(), description: description.value.trim() || null })
    name.value = ''
    description.value = ''
    showForm.value = false
    await load()
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
      <button v-if="canCreate && !showForm" type="button" data-test="create-ministry" @click="showForm = true">Создать служение</button>
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
.ministries-page { max-width: 48rem; margin: 0 auto; color: #202b3a; }
header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
h1 { margin: 0; }
.ministries-page__form { padding: 1rem; border: 1px solid #c9d2df; border-radius: 0.5rem; margin-bottom: 1rem; }
.ministries-page__form fieldset { border: 0; padding: 0; margin: 0; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
input, textarea, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; margin-right: 0.5rem; }
header button { background: #234e79; color: white; }
button:disabled { opacity: 0.6; cursor: wait; }
.ministries-page__list { list-style: none; padding: 0; margin: 0; }
.ministries-page__item { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 0; border-bottom: 1px solid #d8dce2; color: inherit; text-decoration: none; }
.ministries-page__item img, .ministries-page__placeholder { width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; object-fit: cover; flex-shrink: 0; }
.ministries-page__placeholder { display: grid; place-items: center; background: #edf1f6; color: #34445a; }
[role='alert'] { color: #a32020; }
</style>
