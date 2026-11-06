<script setup lang="ts">
import { apiErrorMessage } from '~/utils/apiError'
import AuthShell from '~/components/auth/AuthShell.vue'
import PasswordField from '~/components/PasswordField.vue'

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
// Показываем ожидание в общей оболочке, не выдавая форму до проверки.
void load()

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
    formError.value = apiErrorMessage(error, 'Не удалось изменить пароль. Попробуйте ещё раз.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell title="Сброс пароля" description="Задайте новый пароль для вашего аккаунта.">
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
        <p class="reset-greeting">Здравствуйте, {{ info.person.first_name }} {{ info.person.last_name }}!</p>
        <fieldset class="ui-fieldset account-form">
          <legend>Новый пароль</legend>
        <div>
          <PasswordField v-model="password" data-test="password" label="Пароль" aria-describedby="reset-password-hint" />
          <p id="reset-password-hint" class="account-form__hint">Не менее 8 символов.</p>
        </div>
        <PasswordField
          v-model="passwordConfirmation"
          data-test="password-confirmation"
          label="Повторите пароль"
        />

        </fieldset>
        <p v-if="formError" class="account-notice account-notice--error" role="alert">
          {{ formError }}
        </p>

        <button class="account-form__submit" data-test="submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Сохраняем…' : 'Сохранить пароль' }}
        </button>
      </form>
    </template>
  </AuthShell>
</template>

<style scoped>
.reset-greeting { margin: 0; }
</style>
