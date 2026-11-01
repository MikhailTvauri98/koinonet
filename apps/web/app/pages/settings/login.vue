<script setup lang="ts">
import PasswordField from '~/components/PasswordField.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import { apiErrorMessage } from '~/utils/apiError'

// «Вход» — единственный экран, где меняются логин и пароль (CONTEXT.md:
// "Аккаунт" — избегать "логин" как синоним профиля). Две независимые формы,
// каждая со своим текущим паролем (docs/architecture.md, раздел 7.2).
const api = useApi()
const authStore = useAuthStore()

const login = ref('')
const loginCurrentPassword = ref('')
const loginSaving = ref(false)
const loginError = ref('')

async function submitLogin() {
  if (loginSaving.value) return
  loginSaving.value = true
  loginError.value = ''
  try {
    await api.patch('/me/login', { login: login.value.trim(), current_password: loginCurrentPassword.value })
    loginCurrentPassword.value = ''
    await authStore.fetchMe()
  } catch (error) {
    loginError.value = apiErrorMessage(error, 'Не удалось изменить логин. Попробуйте ещё раз.')
  } finally {
    loginSaving.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordChanged = ref(false)

async function submitPassword() {
  if (passwordSaving.value) return
  passwordError.value = ''
  passwordChanged.value = false

  // Несовпадение повтора ловится на клиенте до запроса (бриф шага 3).
  if (newPassword.value !== newPasswordConfirmation.value) {
    passwordError.value = 'Пароли не совпадают.'
    return
  }

  passwordSaving.value = true
  try {
    await api.patch('/me/password', {
      current_password: currentPassword.value,
      password: newPassword.value,
      password_confirmation: newPasswordConfirmation.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    newPasswordConfirmation.value = ''
    passwordChanged.value = true
  } catch (error) {
    passwordError.value = apiErrorMessage(error, 'Не удалось изменить пароль. Попробуйте ещё раз.')
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <section class="login-settings">
    <SettingsTabs />
    <h1>Вход</h1>

    <section class="login-settings__section">
      <h2>Логин</h2>
      <form class="account-form" data-test="login-form" :aria-busy="loginSaving" @submit.prevent="submitLogin">
        <label class="account-field">
          <span>Новый логин (телефон или email)</span>
          <input v-model="login" data-test="login" type="text" autocomplete="username" required>
        </label>
        <PasswordField v-model="loginCurrentPassword" data-test="login-current-password" label="Текущий пароль" autocomplete="current-password" />
        <p v-if="loginError" class="account-notice account-notice--error" data-test="login-error" role="alert">{{ loginError }}</p>
        <button class="account-form__submit" type="submit" data-test="save-login" :disabled="loginSaving">{{ loginSaving ? 'Сохранение…' : 'Изменить логин' }}</button>
      </form>
    </section>

    <section class="login-settings__section">
      <h2>Пароль</h2>
      <form class="account-form" data-test="password-form" :aria-busy="passwordSaving" @submit.prevent="submitPassword">
        <PasswordField v-model="currentPassword" data-test="password-current" label="Текущий пароль" autocomplete="current-password" />
        <div>
          <PasswordField v-model="newPassword" label="Новый пароль" data-test="password-new" aria-describedby="settings-password-hint" />
          <p id="settings-password-hint" class="account-form__hint">Не менее 8 символов.</p>
        </div>
        <PasswordField v-model="newPasswordConfirmation" label="Повторите новый пароль" data-test="password-confirmation" />
        <p v-if="passwordError" class="account-notice account-notice--error" data-test="password-error" role="alert">{{ passwordError }}</p>
        <p v-if="passwordChanged" class="account-notice account-notice--success" data-test="password-changed" role="status">
          Пароль изменён. Остальные устройства вышли из системы.
        </p>
        <button class="account-form__submit" type="submit" data-test="save-password" :disabled="passwordSaving">{{ passwordSaving ? 'Сохранение…' : 'Изменить пароль' }}</button>
      </form>
    </section>
  </section>
</template>

<style scoped>
.login-settings { max-width: 32rem; min-width: 0; margin: 0 auto; overflow-wrap: anywhere; }
.login-settings__section { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: min(var(--ui-space-6), 20px); box-shadow: var(--ui-shadow); }
.login-settings__section h2 { margin: 0 0 var(--ui-space-4); }
.login-settings__section + .login-settings__section {
  margin-top: var(--ui-space-8);
  padding-top: min(var(--ui-space-6), 20px);
  border-top: 1px solid var(--ui-border);
}
.account-form__submit { justify-self: start; width: auto; max-width: 100%; }
@media (max-width: 480px) {
  .account-form__submit { width: 100%; }
}
</style>
