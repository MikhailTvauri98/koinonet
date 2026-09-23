<script setup lang="ts">
interface LoginErrorData {
  code?: string
  message?: string
  errors?: Record<string, string[]>
}

definePageMeta({ layout: false })

const authStore = useAuthStore()
const router = useRouter()

const loginValue = ref('')
const password = ref('')
const remember = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function describeError(error: unknown): string {
  const data = (error as { data?: LoginErrorData } | undefined)?.data
  const fallback = 'Не удалось войти. Попробуйте ещё раз.'

  if (!data) return fallback

  // Нарушение доменного правила (docs/architecture.md, раздел 8): код без
  // errors по полям — например отключённый аккаунт. Показываем отдельно от
  // обычной ошибки валидации логина/пароля.
  if (data.code) return data.message ?? fallback

  return data.errors?.login?.[0] ?? data.message ?? fallback
}

async function onSubmit() {
  errorMessage.value = null
  loading.value = true

  try {
    await authStore.login(loginValue.value, password.value, remember.value)
    router.push('/')
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <h1>Вход</h1>
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
