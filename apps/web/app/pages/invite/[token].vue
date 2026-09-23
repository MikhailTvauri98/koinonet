<script setup lang="ts">
import type { components } from '~~/types/api'
import type { MeResponse } from '~/stores/auth'

type AccessLinkInfo = components['schemas']['AccessLinkResource']

interface ApiErrorData {
  code?: string
  message?: string
}

// Маршрут публичный и без сессии (docs/architecture.md, раздел 7.2):
// middleware/auth.global.ts уже считает `/invite/*` публичным путём по
// префиксу пути, `auth: false` здесь ничего не переключает сам по себе, но
// документирует намерение на случай, если middleware когда-нибудь станет
// читать page meta вместо префикса.
definePageMeta({ layout: false, auth: false })

// Тексты по кодам ссылки — дословно из ensureUsable()/AccessLinkController
// (apps/api/app/Modules/Directory/{Models/AccessLink.php,Http/Controllers/AccessLinkController.php}),
// а не `error.data.message`: сообщение в теле ошибки существует, но экран
// обязан показывать понятный текст даже если оно когда-нибудь изменится или
// придёт пустым.
const LINK_ERROR_MESSAGES: Record<string, string> = {
  'access_link.expired': 'Срок действия ссылки истёк.',
  'access_link.used': 'Ссылка уже использована.',
  'access_link.revoked': 'Ссылка отозвана.',
  'access_link.invalid': 'Ссылка недействительна.',
}

const route = useRoute()
const router = useRouter()
const api = useApi()
const authStore = useAuthStore()

const token = route.params.token as string

function apiErrorData(error: unknown): ApiErrorData | undefined {
  return (error as { data?: ApiErrorData } | undefined)?.data
}

function describeLinkError(error: unknown): string {
  const data = apiErrorData(error)
  if (data?.code && data.code in LINK_ERROR_MESSAGES) {
    return LINK_ERROR_MESSAGES[data.code]!
  }
  return data?.message ?? 'Не удалось открыть ссылку.'
}

function describeSubmitError(error: unknown): string {
  return apiErrorData(error)?.message ?? 'Не удалось создать аккаунт. Попробуйте ещё раз.'
}

const loading = ref(true)
const linkError = ref<string | null>(null)
const invite = ref<AccessLinkInfo | null>(null)

const login = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const formError = ref<string | null>(null)

async function loadInvite() {
  try {
    const response = await api.get<{ data: AccessLinkInfo }>(`/access-links/${token}`)
    invite.value = response.data
    login.value = response.data.login_hint.phone ?? response.data.login_hint.email ?? ''
  } catch (error) {
    linkError.value = describeLinkError(error)
  } finally {
    loading.value = false
  }
}

// Верхнеуровневый await здесь — сознательно: mountSuspended (и настоящий
// Suspense в приложении) ждёт разрешения setup до первого рендера, так что
// человек не видит пустую форму на мгновение раньше проверки ссылки.
await loadInvite()

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
    formError.value = describeSubmitError(error)
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

    <template v-else-if="invite">
      <h1>Приглашение</h1>
      <p>Здравствуйте, {{ invite.person.first_name }} {{ invite.person.last_name }}!</p>

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
