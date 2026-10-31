<script setup lang="ts">
import type { MeResponse } from '~/stores/auth'
import { apiErrorMessage } from '~/utils/apiError'
import AuthShell from '~/components/auth/AuthShell.vue'
import PasswordField from '~/components/PasswordField.vue'

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
const login = ref('')
// Оболочка показывается сразу, форма — только после проверки ссылки.
// Не блокируем первый рендер верхнеуровневым await.
void load().then(() => {
  login.value = info.value?.login_hint.phone ?? info.value?.login_hint.email ?? ''
})
const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const formError = ref<string | null>(null)

async function onSubmit() {
  if (submitting.value) return
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
    await authStore.setMe(me)
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
  <AuthShell title="Приглашение" description="Создайте аккаунт, чтобы войти в систему.">
    <p v-if="loading" role="status">
      Проверяем ссылку…
    </p>

    <div v-else-if="linkError" class="account-link-error">
      <p class="account-notice account-notice--error" role="alert">{{ linkError }}</p>
      <p>Попробуйте открыть ссылку ещё раз или попросите новую.</p>
      <NuxtLink to="/login">Перейти ко входу</NuxtLink>
    </div>

    <template v-else-if="info">
      <form class="account-form" :aria-busy="submitting" @submit.prevent="onSubmit">
        <p class="invite-greeting">Здравствуйте, {{ info.person.first_name }} {{ info.person.last_name }}!</p>
        <label class="account-field">
          <span>Телефон или email</span>
          <input
            v-model="login"
            data-test="login"
            type="text"
            autocomplete="username"
            required
          >
        </label>

        <div>
          <PasswordField v-model="password" data-test="password" label="Пароль" aria-describedby="invite-password-hint" />
          <p id="invite-password-hint" class="account-form__hint">Не менее 8 символов.</p>
        </div>
        <PasswordField
          v-model="passwordConfirmation"
          data-test="password-confirmation"
          label="Повторите пароль"
        />

        <p v-if="formError" class="account-notice account-notice--error" role="alert">
          {{ formError }}
        </p>

        <button class="account-form__submit" data-test="submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Создаём аккаунт…' : 'Создать аккаунт' }}
        </button>
      </form>
    </template>
  </AuthShell>
</template>

<style scoped>
.invite-greeting { margin: 0; }
</style>
