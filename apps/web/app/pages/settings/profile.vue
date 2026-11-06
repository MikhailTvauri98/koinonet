<script setup lang="ts">
import type { components } from '~~/types/api'
import MediaUploader from '~/components/MediaUploader.vue'
import FormSection from '~/components/ui/FormSection.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'
import type { DirectLinkResources } from '~/utils/media'

// «Профиль» правит контакты человека и не содержит полей логина — логин и
// пароль меняются на отдельном экране «Безопасность» (settings/login.vue), так
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
const refreshing = ref(false)
const refreshError = ref('')
const saving = ref(false)
const savedNotice = ref(false)
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
let generation = 0
let readGeneration = 0
let mounted = true
const snapshot = () => ({ phone: phone.value, email: email.value, birthDate: birthDate.value, contactsPublic: contactsPublic.value, photoUrl: photoUrl.value })
type Draft = ReturnType<typeof snapshot>
let refreshBaseline: Draft | undefined
function current(version: number, session: number) {
  return mounted && version === generation && session === authStore.sessionVersion
}
function applyProfile(data: Profile, baseline?: Draft) {
  if (!baseline || photoUrl.value === baseline.photoUrl) photoUrl.value = data.photo_url
  if (!baseline || phone.value === baseline.phone) phone.value = data.contacts.phone ?? ''
  if (!baseline || email.value === baseline.email) email.value = data.contacts.email ?? ''
  if (!baseline || birthDate.value === baseline.birthDate) birthDate.value = data.contacts.birth_date ?? ''
  if (!baseline || contactsPublic.value === baseline.contactsPublic) contactsPublic.value = data.contacts_public
}
async function load(preserveDraft = false) {
  const version = generation, session = authStore.sessionVersion, read = ++readGeneration
  const baseline = preserveDraft ? refreshBaseline : undefined
  if (preserveDraft) { refreshing.value = true; refreshError.value = '' }
  else { loading.value = true; loadError.value = '' }
  try {
    const response = await api.get<{ data: Profile }>('/me/profile')
    if (current(version, session) && read === readGeneration) applyProfile(response.data, baseline)
  } catch (error) {
    if (!current(version, session) || read !== readGeneration) return
    if (preserveDraft) refreshError.value = 'Сохранено, но не удалось обновить данные профиля. Повторите загрузку.'
    else loadError.value = apiErrorMessage(error, 'Не удалось загрузить профиль. Попробуйте ещё раз.')
  } finally {
    if (current(version, session) && read === readGeneration) { loading.value = false; refreshing.value = false }
  }
}
async function submit() {
  if (saving.value) return
  const version = generation, session = authStore.sessionVersion, submitted = snapshot()
  readGeneration++
  refreshing.value = false
  refreshError.value = ''
  saving.value = true
  savedNotice.value = false
  errorMessage.value = ''
  fieldErrors.value = {}
  try {
    await api.patch('/me/profile', {
      phone: submitted.phone.trim() || null,
      email: submitted.email.trim() || null,
      birth_date: submitted.birthDate || null,
      contacts_public: submitted.contactsPublic,
    })
    if (!current(version, session)) return
    savedNotice.value = true
    refreshBaseline = submitted
    // Read canonical contacts even when PATCH can return only an id.
    // A failed read never turns the confirmed write into a failed save.
    void load(true)
    void authStore.fetchMe().catch(() => {})
  } catch (error) {
    if (!current(version, session)) return
    errorMessage.value = apiErrorMessage(error, 'Не удалось сохранить профиль. Попробуйте ещё раз.')
    fieldErrors.value = apiFieldErrors(error)
  } finally {
    if (current(version, session)) saving.value = false
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
  const version = generation, session = authStore.sessionVersion
  loggingOut.value = true
  logoutError.value = ''
  try {
    await authStore.logout()
    if (mounted && !authStore.user && authStore.sessionVersion === session + 1) await navigateTo('/login')
  } catch (error) {
    if (current(version, session)) logoutError.value = apiErrorMessage(error, 'Не удалось выйти. Попробуйте ещё раз.')
  } finally {
    if (current(version, session)) loggingOut.value = false
  }
}
watch(() => authStore.sessionVersion, () => {
  generation++; readGeneration++
  photoUrl.value = null; phone.value = ''; email.value = ''; birthDate.value = ''; contactsPublic.value = false
  saving.value = false; savedNotice.value = false; refreshing.value = false
  errorMessage.value = ''; fieldErrors.value = {}; refreshError.value = ''; refreshBaseline = undefined
  loggingOut.value = false; logoutError.value = ''
  if (authStore.user) void load()
  else loading.value = false
})
onBeforeUnmount(() => { mounted = false; generation++; readGeneration++ })
await load()
</script>

<template>
  <section class="profile-page">
    <SettingsTabs />
    <h1>Профиль</h1>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-else-if="loadError" role="alert">
      {{ loadError }} <button type="button" data-test="retry" @click="load()">Повторить</button>
    </p>
    <template v-else>
      <form class="ui-form" :aria-busy="saving" @submit.prevent="submit">
        <div class="ui-form-grid">
          <FormSection class="profile-page__photo-section" title="Фото" description="Ваше фото видно другим людям в системе.">
            <div class="profile-page__photo">
              <img v-if="photoUrl" :src="photoUrl" alt="Моё фото" width="96" height="96" data-test="photo">
              <MediaUploader purpose="person_photo" target="/me/photo" label="Выбрать фото" @attached="onPhotoAttached" />
            </div>
          </FormSection>
          <FormSection class="profile-page__contacts-section" title="Контакты" description="Телефон и электронная почта здесь не меняют логин аккаунта.">
            <label class="ui-field">
              <span id="profile-phone-caption">Телефон</span>
              <input v-model="phone" type="tel" name="phone" aria-labelledby="profile-phone-caption" :aria-invalid="!!fieldErrors.phone" :aria-describedby="fieldErrors.phone ? 'profile-phone-error' : undefined">
              <span v-if="fieldErrors.phone" id="profile-phone-error" class="ui-field-error" role="alert">{{ fieldErrors.phone.join(' ') }}</span>
            </label>
            <label class="ui-field">
              <span id="profile-email-caption">Электронная почта</span>
              <input v-model="email" type="email" name="email" aria-labelledby="profile-email-caption" :aria-invalid="!!fieldErrors.email" :aria-describedby="fieldErrors.email ? 'profile-email-error' : undefined">
              <span v-if="fieldErrors.email" id="profile-email-error" class="ui-field-error" role="alert">{{ fieldErrors.email.join(' ') }}</span>
            </label>
            <label class="ui-field profile-page__date">
              <span id="profile-date-caption">Дата рождения</span>
              <input v-model="birthDate" type="date" name="birth_date" aria-labelledby="profile-date-caption" :aria-invalid="!!fieldErrors.birth_date" :aria-describedby="fieldErrors.birth_date ? 'profile-date-error' : undefined">
              <span v-if="fieldErrors.birth_date" id="profile-date-error" class="ui-field-error" role="alert">{{ fieldErrors.birth_date.join(' ') }}</span>
            </label>
          </FormSection>
          <FormSection class="profile-page__visibility-section" title="Видимость контактов" description="ФИО и статус человека меняет тот, у кого есть право управлять людьми.">
            <label class="ui-choice profile-page__checkbox">
              <input v-model="contactsPublic" type="checkbox" data-test="contacts-public">
              <span>Показывать мои контакты всем</span>
            </label>
          </FormSection>
        </div>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <p v-if="savedNotice" data-test="profile-saved" role="status">Сохранено.</p>
        <p v-if="refreshing" role="status">Обновляем сохранённые данные…</p>
        <p v-if="refreshError" role="alert">{{ refreshError }} <button type="button" data-test="retry-profile-refresh" @click="load(true)">Повторить загрузку</button></p>
        <div class="ui-form-actions">
          <button class="ui-button ui-button--primary" type="submit" data-test="save-profile" :disabled="saving">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button>
        </div>
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
.profile-page { max-width: 56rem; min-width: 0; color: var(--ui-text); overflow-wrap: anywhere; }
.ui-form-grid { align-items: start; }
@container (min-width: 680px) {
  .profile-page__photo-section { grid-column: 1; grid-row: 1; }
  .profile-page__contacts-section { grid-column: 2; grid-row: 1 / span 2; }
  .profile-page__visibility-section { grid-column: 1; grid-row: 2; }
}
.profile-page__photo { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-4); min-width: 0; }
.profile-page__photo img { border-radius: 50%; object-fit: cover; }
.profile-page__checkbox { align-items: flex-start; }
.profile-page__checkbox input { margin-top: .3em; }
.profile-page__logout { margin-top: var(--ui-space-8); padding-top: var(--ui-space-6); border-top: 1px solid var(--ui-border); }
button { max-width: 100%; overflow-wrap: anywhere; }
.danger { color: var(--ui-danger); border-color: var(--ui-danger); }
[role='alert'], .error { color: var(--ui-danger); }
@media (max-width: 479px) {
  /* Full native date and checkbox caption at 200% on a narrow phone. */
  .profile-page :deep(.ui-form-section) { padding-inline: 8px; }
  .profile-page__checkbox { gap: 8px; }
}
</style>
