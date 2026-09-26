<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'

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
  <main class="login-page">
    <h1>Вход</h1>
    <p v-if="passwordChanged" class="login-page__notice" role="status">
      Пароль изменён. Войдите с новым паролем.
    </p>
    <form @submit.prevent="onSubmit">
      <label>
        Телефон или email
        <input
          v-model="loginValue"
          data-test="login"
          type="text"
          autocomplete="username"
          required
        >
      </label>
      <label>
        Пароль
        <input
          v-model="password"
          data-test="password"
          type="password"
          autocomplete="current-password"
          required
        >
      </label>
      <label class="login-page__remember">
        <input v-model="remember" type="checkbox">
        Запомнить меня
      </label>
      <p v-if="errorMessage" class="login-page__error" role="alert">
        {{ errorMessage }}
      </p>
      <button data-test="submit" type="submit" :disabled="loading">
        Войти
      </button>
    </form>
  </main>
</template>
