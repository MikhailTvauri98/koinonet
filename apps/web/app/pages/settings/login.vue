<script setup lang="ts">
import PasswordField from '~/components/PasswordField.vue'
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
    <nav aria-label="Разделы настроек" class="login-settings__tabs">
      <NuxtLink to="/settings/profile">Профиль</NuxtLink>
      <NuxtLink to="/settings/login" class="login-settings__tabs-active">Вход</NuxtLink>
      <NuxtLink to="/settings/devices">Устройства</NuxtLink>
    </nav>
    <h1>Вход</h1>

    <section>
      <h2>Логин</h2>
      <form data-test="login-form" @submit.prevent="submitLogin">
        <label>
          Новый логин (телефон или email)
          <input v-model="login" data-test="login" type="text" required>
        </label>
        <label>
          Текущий пароль
          <input v-model="loginCurrentPassword" data-test="login-current-password" type="password" autocomplete="current-password" required>
        </label>
        <p v-if="loginError" data-test="login-error" role="alert">{{ loginError }}</p>
        <button type="submit" data-test="save-login" :disabled="loginSaving">{{ loginSaving ? 'Сохранение…' : 'Изменить логин' }}</button>
      </form>
    </section>

    <section>
      <h2>Пароль</h2>
      <form data-test="password-form" @submit.prevent="submitPassword">
        <label>
          Текущий пароль
          <input v-model="currentPassword" data-test="password-current" type="password" autocomplete="current-password" required>
        </label>
        <PasswordField v-model="newPassword" label="Новый пароль" data-test="password-new" />
        <PasswordField v-model="newPasswordConfirmation" label="Повторите новый пароль" data-test="password-confirmation" />
        <p v-if="passwordError" data-test="password-error" role="alert">{{ passwordError }}</p>
        <p v-if="passwordChanged" data-test="password-changed" role="status">
          Пароль изменён. Остальные устройства вышли из системы.
        </p>
        <button type="submit" data-test="save-password" :disabled="passwordSaving">{{ passwordSaving ? 'Сохранение…' : 'Изменить пароль' }}</button>
      </form>
    </section>
  </section>
</template>

<style scoped>
.login-settings { max-width: 32rem; margin: 0 auto; color: #202b3a; }
.login-settings__tabs { display: flex; gap: 1rem; margin-bottom: 1rem; }
.login-settings__tabs-active { font-weight: 600; }
section { margin-bottom: 2rem; }
form { display: flex; flex-direction: column; gap: 1rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; }
input, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
button { cursor: pointer; align-self: flex-start; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
