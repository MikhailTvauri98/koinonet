<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'
import AuthShell from '~/components/auth/AuthShell.vue'
import PasswordField from '~/components/PasswordField.vue'

definePageMeta({ layout: false })

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

// Экран сброса пароля (pages/password-reset/[token].vue) ведёт сюда с этим
// флагом в query после смены пароля: сервер на приёме ссылки сброса не
// логинит и завершает все сессии аккаунта (AcceptAccessLink.php), так что
// человек попадает именно на «Вход», а не в приложение — и должен понимать
// почему, а не просто увидеть пустую форму входа.
const passwordChanged = computed(() => route.query.passwordChanged === '1')

const loginValue = ref('')
const password = ref('')
const remember = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit() {
  if (loading.value) return
  errorMessage.value = null
  loading.value = true

  try {
    await authStore.login(loginValue.value, password.value, remember.value)
    router.push('/')
  } catch (error) {
    // Неверный логин или пароль и отключённый аккаунт приходят `422` с
    // русским текстом сервера; частые попытки — `429`.
    errorMessage.value = apiErrorMessage(error, 'Не удалось войти. Попробуйте ещё раз.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="Вход" description="Используйте телефон или email вашего аккаунта.">
    <form class="account-form" :aria-busy="loading" @submit.prevent="onSubmit">
      <p v-if="passwordChanged" class="account-notice account-notice--success" role="status">
        Пароль изменён. Войдите с новым паролем.
      </p>
      <fieldset class="ui-fieldset account-form">
        <legend>Данные аккаунта</legend>
      <label class="account-field">
        <span>Телефон или email</span>
        <input
          v-model="loginValue"
          data-test="login"
          type="text"
          autocomplete="username"
          required
        >
      </label>
      <PasswordField v-model="password" data-test="password" label="Пароль" autocomplete="current-password" />
      <label class="account-form__remember">
        <input v-model="remember" type="checkbox">
        Запомнить меня
      </label>
      </fieldset>
      <p v-if="errorMessage" class="account-notice account-notice--error" role="alert">
        {{ errorMessage }}
      </p>
      <button class="account-form__submit" data-test="submit" type="submit" :disabled="loading">
        {{ loading ? 'Входим…' : 'Войти' }}
      </button>
    </form>
  </AuthShell>
</template>
