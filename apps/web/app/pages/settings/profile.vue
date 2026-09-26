<script setup lang="ts">
import type { components } from '~~/types/api'
import MediaUploader from '~/components/MediaUploader.vue'
import { peopleErrorMessage, type PeopleError } from '~/utils/people'

// «Профиль» правит контакты человека и не содержит полей логина — логин и
// пароль меняются на отдельном экране «Вход» (settings/login.vue), так
// требует CONTEXT.md ("Устройство"/"Аккаунт" — избегать смешения понятий)
// и бриф задачи 30.
type Profile = components['schemas']['MyProfileResource']

const api = useApi()
const authStore = useAuthStore()

const photoUrl = ref<string | null>(null)
const phone = ref('')
const email = ref('')
const birthDate = ref('')
const contactsPublic = ref(false)

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const savedNotice = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

function applyProfile(data: Profile) {
  photoUrl.value = data.photo_url
  phone.value = data.contacts.phone ?? ''
  email.value = data.contacts.email ?? ''
  birthDate.value = data.contacts.birth_date ?? ''
  contactsPublic.value = data.contacts_public
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.get<{ data: Profile }>('/me/profile')
    applyProfile(response.data)
  } catch (error) {
    loadError.value = peopleErrorMessage(error, 'Не удалось загрузить профиль. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (saving.value) return
  saving.value = true
  savedNotice.value = false
  errorMessage.value = ''
  fieldErrors.value = {}
  try {
    await api.patch('/me/profile', {
      phone: phone.value.trim() || null,
      email: email.value.trim() || null,
      birth_date: birthDate.value || null,
      contacts_public: contactsPublic.value,
    })
    // Своё меняем без прав, но сервер остаётся источником правды по всему
    // остальному (docs/architecture.md, раздел 10) — перечитываем и профиль,
    // и /auth/me, как карточка человека делает после правки своего аккаунта.
    await Promise.all([load(), authStore.fetchMe()])
    savedNotice.value = true
  } catch (error) {
    errorMessage.value = peopleErrorMessage(error, 'Не удалось сохранить профиль. Попробуйте ещё раз.')
    fieldErrors.value = (error as PeopleError | undefined)?.data?.errors ?? {}
  } finally {
    saving.value = false
  }
}

function onPhotoUploaded(newPhotoUrl: string | null) {
  photoUrl.value = newPhotoUrl
}

await load()
</script>

<template>
  <main class="profile-page">
    <nav aria-label="Разделы настроек" class="profile-page__tabs">
      <NuxtLink to="/settings/profile" class="profile-page__tabs-active">Профиль</NuxtLink>
      <NuxtLink to="/settings/login">Вход</NuxtLink>
      <NuxtLink to="/settings/devices">Устройства</NuxtLink>
    </nav>
    <h1>Профиль</h1>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="loadError" role="alert">
      {{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <template v-else>
      <section class="profile-page__photo">
        <img v-if="photoUrl" :src="photoUrl" alt="Моё фото" width="96" height="96" data-test="photo">
        <MediaUploader purpose="person_photo" target="/me/photo" @uploaded="onPhotoUploaded" />
      </section>
      <form @submit.prevent="submit">
        <label>
          Телефон
          <input v-model="phone" type="tel" name="phone" :aria-invalid="!!fieldErrors.phone">
          <span v-if="fieldErrors.phone" class="error" role="alert">{{ fieldErrors.phone.join(' ') }}</span>
        </label>
        <label>
          Электронная почта
          <input v-model="email" type="email" name="email" :aria-invalid="!!fieldErrors.email">
          <span v-if="fieldErrors.email" class="error" role="alert">{{ fieldErrors.email.join(' ') }}</span>
        </label>
        <label>
          Дата рождения
          <input v-model="birthDate" type="date" name="birth_date" :aria-invalid="!!fieldErrors.birth_date">
          <span v-if="fieldErrors.birth_date" class="error" role="alert">{{ fieldErrors.birth_date.join(' ') }}</span>
        </label>
        <label class="profile-page__checkbox">
          <input v-model="contactsPublic" type="checkbox" data-test="contacts-public">
          Показывать мои контакты всем
        </label>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <p v-if="savedNotice" role="status">Сохранено.</p>
        <button type="submit" data-test="save-profile" :disabled="saving">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button>
      </form>
    </template>
  </main>
</template>

<style scoped>
.profile-page { max-width: 32rem; margin: 0 auto; color: #202b3a; }
.profile-page__tabs { display: flex; gap: 1rem; margin-bottom: 1rem; }
.profile-page__tabs-active { font-weight: 600; }
.profile-page__photo { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.profile-page__photo img { border-radius: 50%; object-fit: cover; }
form { display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; }
.profile-page__checkbox { flex-direction: row; align-items: center; gap: 0.5rem; }
input, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; align-self: flex-start; }
button:disabled { opacity: 0.6; cursor: wait; }
.error { color: #a32020; }
</style>
