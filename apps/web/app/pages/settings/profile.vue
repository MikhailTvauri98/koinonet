<script setup lang="ts">
import type { components } from '~~/types/api'
import MediaUploader from '~/components/MediaUploader.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import type { DirectLinkResources } from '~/utils/media'

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
    loadError.value = apiErrorMessage(error, 'Не удалось загрузить профиль. Попробуйте ещё раз.')
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
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить профиль. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally {
    saving.value = false
  }
}

// `PUT /me/photo` отвечает карточкой человека — из неё нужен только новый
// адрес фото.
function onPhotoAttached(person: DirectLinkResources['person_photo']) {
  if ('photo_url' in person) photoUrl.value = person.photo_url
}

const loggingOut = ref(false)
const logoutError = ref('')

// Выход — здесь, в профиле: он есть у каждого вошедшего, а нижняя панель
// вкладок телефона и так заполнена разделами. Стор чистится только после
// ответа сервера (stores/auth.ts).
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await authStore.logout()
    await navigateTo('/login')
  } catch (error) {
    logoutError.value = apiErrorMessage(error, 'Не удалось выйти. Попробуйте ещё раз.')
  } finally {
    loggingOut.value = false
  }
}

await load()
</script>

<template>
  <section class="profile-page">
    <SettingsTabs />
    <h1>Профиль</h1>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="loadError" role="alert">
      {{ loadError }} <button type="button" data-test="retry" @click="load">Повторить</button>
    </p>
    <template v-else>
      <section class="profile-page__photo">
        <img v-if="photoUrl" :src="photoUrl" alt="Моё фото" width="96" height="96" data-test="photo">
        <MediaUploader purpose="person_photo" target="/me/photo" label="Выбрать фото" @attached="onPhotoAttached" />
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
    <section class="profile-page__logout">
      <button type="button" class="danger" data-test="logout" :disabled="loggingOut" @click="logout">
        {{ loggingOut ? 'Выходим…' : 'Выйти' }}
      </button>
      <p v-if="logoutError" class="error" role="alert" data-test="logout-error">{{ logoutError }}</p>
    </section>
  </section>
</template>

<style scoped>
.profile-page { max-width: 40rem; min-width: 0; margin: 0 auto; color: var(--ui-text); overflow-wrap: anywhere; }
.profile-page__photo { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-4); margin-bottom: var(--ui-space-6); min-width: 0; }
.profile-page__photo img { border-radius: 50%; object-fit: cover; }
form { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-6), 20px); box-shadow: var(--ui-shadow); }
.profile-page__checkbox { display: flex; align-items: flex-start; gap: var(--ui-space-3); cursor: pointer; }
.profile-page__checkbox input { flex-shrink: 0; margin-top: .3em; }
.profile-page__logout { margin-top: var(--ui-space-8); padding-top: var(--ui-space-6); border-top: 1px solid var(--ui-border); }
form { display: grid; gap: var(--ui-space-4); min-width: 0; }
label { display: grid; gap: var(--ui-space-2); min-width: 0; }
input:not([type='checkbox']), select, textarea { width: 100%; max-width: 100%; }
button { max-width: 100%; overflow-wrap: anywhere; }
button[type='submit'], .primary { background: var(--ui-accent); color: var(--ui-surface); border-color: var(--ui-accent); }
button[type='submit']:hover:not(:disabled), .primary:hover:not(:disabled) { background: var(--ui-accent-hover); }
.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
[role='alert'], .error { color: var(--ui-danger); }
@media (max-width: 480px) {
  /* Оболочка уже даёт поверхность: повторный отступ сужал дату и подпись при 200%. */
  form { padding: 0; border: 0; border-radius: 0; box-shadow: none; }
  .profile-page__checkbox { gap: min(var(--ui-space-3), 12px); }
}
</style>
