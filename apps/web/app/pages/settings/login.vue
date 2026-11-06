<script setup lang="ts">
import FormSection from '~/components/ui/FormSection.vue'
import PasswordField from '~/components/PasswordField.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

// «Безопасность» — единственный экран, где меняются логин и пароль (CONTEXT.md:
// "Аккаунт" — избегать "логин" как синоним профиля). Две независимые формы,
// каждая со своим текущим паролем (docs/architecture.md, раздел 7.2).
const api = useApi()
const authStore = useAuthStore()
let generation = 0
function current(version: number, session: number) {
  return version === generation && session === authStore.sessionVersion
}

const login = ref('')
const loginCurrentPassword = ref('')
const loginSaving = ref(false)
const loginError = ref('')
const loginFields = ref<Record<string, string[]>>({})
const loginChanged = ref(false)

async function submitLogin() {
  if (loginSaving.value) return
  loginSaving.value = true
  loginError.value = ''
  loginFields.value = {}
  loginChanged.value = false
  const version = generation, session = authStore.sessionVersion
  try {
    await api.patch('/me/login', { login: login.value.trim(), current_password: loginCurrentPassword.value })
    if (!current(version, session)) return
    loginCurrentPassword.value = ''
    loginChanged.value = true
    // Refresh is independent from the confirmed change.
    void authStore.fetchMe().catch(() => {})
  } catch (error) {
    if (!current(version, session)) return
    loginFields.value = apiFieldErrors(error)
    loginError.value = apiErrorMessage(error, 'Не удалось изменить логин. Попробуйте ещё раз.')
  } finally {
    if (current(version, session)) loginSaving.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordChanged = ref(false)
const passwordFields = ref<Record<string, string[]>>({})

async function submitPassword() {
  if (passwordSaving.value) return
  passwordError.value = ''
  passwordChanged.value = false
  passwordFields.value = {}

  // Несовпадение повтора ловится на клиенте до запроса (бриф шага 3).
  if (newPassword.value !== newPasswordConfirmation.value) {
    passwordError.value = 'Пароли не совпадают.'
    return
  }

  const version = generation, session = authStore.sessionVersion
  passwordSaving.value = true
  try {
    await api.patch('/me/password', {
      current_password: currentPassword.value,
      password: newPassword.value,
      password_confirmation: newPasswordConfirmation.value,
    })
    if (!current(version, session)) return
    currentPassword.value = ''
    newPassword.value = ''
    newPasswordConfirmation.value = ''
    passwordChanged.value = true
  } catch (error) {
    if (!current(version, session)) return
    passwordFields.value = apiFieldErrors(error)
    passwordError.value = apiErrorMessage(error, 'Не удалось изменить пароль. Попробуйте ещё раз.')
  } finally {
    if (current(version, session)) passwordSaving.value = false
  }
}
watch(() => authStore.sessionVersion, () => {
  generation++
  login.value = ''; loginCurrentPassword.value = ''; loginSaving.value = false; loginError.value = ''; loginFields.value = {}; loginChanged.value = false
  currentPassword.value = ''; newPassword.value = ''; newPasswordConfirmation.value = ''; passwordSaving.value = false; passwordError.value = ''; passwordFields.value = {}; passwordChanged.value = false
})
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="login-settings">
    <SettingsTabs />
    <h1>Безопасность</h1>
    <div class="ui-form-grid">

    <FormSection title="Логин" description="Изменение логина не меняет контакты человека.">
      <form class="account-form" data-test="login-form" :aria-busy="loginSaving" @submit.prevent="submitLogin">
        <label class="account-field">
          <span id="security-login-caption">Новый логин (телефон или email)</span>
          <input v-model="login" data-test="login" aria-labelledby="security-login-caption" type="text" autocomplete="username" required :aria-invalid="!!loginFields.login" :aria-describedby="loginFields.login ? 'security-login-error' : undefined">
          <span v-if="loginFields.login" id="security-login-error" class="ui-field-error" role="alert">{{ loginFields.login.join(' ') }}</span>
        </label>
        <PasswordField v-model="loginCurrentPassword" data-test="login-current-password" label="Текущий пароль" autocomplete="current-password" :error="loginFields.current_password?.join(' ')" />
        <p v-if="loginChanged" role="status" data-test="login-changed">Логин изменён.</p>
        <p v-if="loginError" class="account-notice account-notice--error" data-test="login-error" role="alert">{{ loginError }}</p>
        <button class="account-form__submit" type="submit" data-test="save-login" :disabled="loginSaving">{{ loginSaving ? 'Сохранение…' : 'Изменить логин' }}</button>
      </form>
    </FormSection>

    <FormSection title="Пароль" description="Для каждой операции отдельно подтвердите текущий пароль.">
      <form class="account-form" data-test="password-form" :aria-busy="passwordSaving" @submit.prevent="submitPassword">
        <PasswordField v-model="currentPassword" data-test="password-current" label="Текущий пароль" autocomplete="current-password" :error="passwordFields.current_password?.join(' ')" />
        <div>
          <PasswordField v-model="newPassword" label="Новый пароль" data-test="password-new" aria-describedby="settings-password-hint" :error="passwordFields.password?.join(' ')" />
          <p id="settings-password-hint" class="account-form__hint">Не менее 8 символов.</p>
        </div>
        <PasswordField v-model="newPasswordConfirmation" label="Повторите новый пароль" data-test="password-confirmation" :error="passwordFields.password_confirmation?.join(' ')" />
        <p v-if="passwordError" class="account-notice account-notice--error" data-test="password-error" role="alert">{{ passwordError }}</p>
        <p v-if="passwordChanged" class="account-notice account-notice--success" data-test="password-changed" role="status">
          Пароль изменён. Остальные устройства вышли из системы.
        </p>
        <button class="account-form__submit" type="submit" data-test="save-password" :disabled="passwordSaving">{{ passwordSaving ? 'Сохранение…' : 'Изменить пароль' }}</button>
      </form>
    </FormSection>
    </div>
  </section>
</template>

<style scoped>
.login-settings { max-width: 56rem; min-width: 0; overflow-wrap: anywhere; }
.account-form__submit { justify-self: start; width: auto; max-width: 100%; }
@media (max-width: 479px) { .login-settings :deep(.ui-form-section) { padding-inline: 8px; } }
</style>
