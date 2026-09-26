<script setup lang="ts">
import type { MeResponse } from '~/stores/auth'
import { apiErrorMessage } from '~/utils/apiError'

// Маршрут публичный и без сессии (docs/architecture.md, раздел 7.2):
// middleware/auth.global.ts уже считает `/invite/*` публичным путём по
// префиксу пути, `auth: false` здесь ничего не переключает сам по себе, но
// документирует намерение на случай, если middleware когда-нибудь станет
// читать page meta вместо префикса.
definePageMeta({ layout: false, auth: false })

const route = useRoute()
const router = useRouter()
const api = useApi()
const authStore = useAuthStore()

const token = route.params.token as string

// Загрузка ссылки, отказы по коду и по несовпадающему виду — общие с
// экраном сброса пароля, вынесены в useAccessLinkInfo.ts.
const { loading, linkError, info, load } = useAccessLinkInfo(token, 'invite')
await load()

// Верхнеуровневый await выше — сознательно: mountSuspended (и настоящий
// Suspense в приложении) ждёт разрешения setup до первого рендера, так что
// человек не видит пустую форму на мгновение раньше проверки ссылки.
const login = ref(info.value?.login_hint.phone ?? info.value?.login_hint.email ?? '')
const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const formError = ref<string | null>(null)

async function onSubmit() {
  formError.value = null

  if (password.value !== passwordConfirmation.value) {
    formError.value = 'Пароли не совпадают.'
    return
  }

  const payload = {
    login: login.value,
    password: password.value,
    password_confirmation: passwordConfirmation.value,
  }
  // Пароль не должен жить в состоянии компонента дольше, чем нужно для
  // запроса: значения уже захвачены в payload, поля очищаются сразу, а не
  // после ответа сервера (который может задержаться или не прийти).
  password.value = ''
  passwordConfirmation.value = ''

  submitting.value = true
  try {
    // Для kind=invite ответ — MeResource без обёртки `data`, как у
    // /auth/login: сервер уже залогинил аккаунт (docs/architecture.md:444),
    // и это тот же снимок, что использует authStore.login().
    const me = await api.post<MeResponse>(`/access-links/${token}/accept`, payload)
    authStore.setMe(me)
    // Человек уже вошёл — ведём сразу в приложение, повторный вход на
    // /login не требуется (критерий готовности задачи 26). Без await, как в
    // pages/login.vue: переход не блокирует finally ниже.
    router.push('/')
  } catch (error) {
    formError.value = apiErrorMessage(error, 'Не удалось создать аккаунт. Попробуйте ещё раз.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="invite-page">
    <p v-if="loading">
      Проверяем ссылку…
    </p>

    <p v-else-if="linkError" class="invite-page__error" role="alert">
      {{ linkError }}
    </p>

    <template v-else-if="info">
      <h1>Приглашение</h1>
      <p>Здравствуйте, {{ info.person.first_name }} {{ info.person.last_name }}!</p>

      <form @submit.prevent="onSubmit">
        <label>
          Телефон или email
          <input
            v-model="login"
            data-test="login"
            type="text"
            autocomplete="username"
            required
          >
        </label>

        <PasswordField
          v-model="password"
          data-test="password"
          label="Пароль"
        />
        <PasswordField
          v-model="passwordConfirmation"
          data-test="password-confirmation"
          label="Повторите пароль"
        />

        <p v-if="formError" class="invite-page__error" role="alert">
          {{ formError }}
        </p>

        <button data-test="submit" type="submit" :disabled="submitting">
          Создать аккаунт
        </button>
      </form>
    </template>
  </main>
</template>
