<script setup lang="ts">
interface ApiErrorData {
  message?: string
}

// Маршрут публичный и без сессии — как /invite/{token}
// (docs/architecture.md, раздел 7.2; CreatePasswordResetLink.php строит
// именно `{frontend_url}/password-reset/{token}`). middleware/auth.global.ts
// считает `/password-reset/*` публичным путём по префиксу, `auth: false`
// здесь только документирует намерение (см. тот же комментарий на
// pages/invite/[token].vue).
definePageMeta({ layout: false, auth: false })

const route = useRoute()
const router = useRouter()
const api = useApi()
const authStore = useAuthStore()

const token = route.params.token as string

// Загрузка ссылки, отказы по коду и по несовпадающему виду — общие с
// экраном приглашения, вынесены в useAccessLinkInfo.ts.
const { loading, linkError, info, load } = useAccessLinkInfo(token, 'password_reset')
await load()

const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const formError = ref<string | null>(null)

function describeSubmitError(error: unknown): string {
  const data = (error as { data?: ApiErrorData } | undefined)?.data
  return data?.message ?? 'Не удалось изменить пароль. Попробуйте ещё раз.'
}

async function onSubmit() {
  formError.value = null

  if (password.value !== passwordConfirmation.value) {
    formError.value = 'Пароли не совпадают.'
    return
  }

  // Для kind=password_reset тело не содержит `login` вовсе (не просто
  // пустую строку): AcceptAccessLink.php считает саму его наличие в запросе
  // попыткой сменить логин через ссылку сброса и отклоняет её
  // ("Логин нельзя менять через ссылку сброса пароля.").
  const payload = {
    password: password.value,
    password_confirmation: passwordConfirmation.value,
  }
  // Как и на экране приглашения: пароль не должен жить в состоянии
  // компонента дольше, чем нужно для запроса.
  password.value = ''
  passwordConfirmation.value = ''

  submitting.value = true
  try {
    // Сервер не логинит: AcceptAccessLink.php возвращает user: null для
    // password_reset и завершает все сессии аккаунта. Человек идёт на
    // «Вход» с новым паролем, а не в приложение — в отличие от приглашения.
    await api.post(`/access-links/${token}/accept`, payload)
    // Вкладка могла быть вошедшей ДО отправки — своим же аккаунтом (его
    // сессию сервер только что убил) или чужим (например администратор
    // проверял ссылку — его сессия жива и не при чём). Локальный `user` в
    // обоих случаях не заслуживает доверия: forgetSession() заставляет
    // ближайший прогон middleware спросить сервер заново, а не полагаться на
    // то, что было в сторе до этого запроса.
    authStore.forgetSession()
    router.push('/login?passwordChanged=1')
  } catch (error) {
    formError.value = describeSubmitError(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="password-reset-page">
    <p v-if="loading">
      Проверяем ссылку…
    </p>

    <p v-else-if="linkError" class="password-reset-page__error" role="alert">
      {{ linkError }}
    </p>

    <template v-else-if="info">
      <h1>Сброс пароля</h1>
      <p>Здравствуйте, {{ info.person.first_name }} {{ info.person.last_name }}!</p>

      <form @submit.prevent="onSubmit">
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

        <p v-if="formError" class="password-reset-page__error" role="alert">
          {{ formError }}
        </p>

        <button data-test="submit" type="submit" :disabled="submitting">
          Сохранить пароль
        </button>
      </form>
    </template>
  </main>
</template>
