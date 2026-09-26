import type { components } from '~~/types/api'
import type { Permissions } from '~/composables/useCan'
import { apiErrorStatus } from '~/utils/apiError'

// Снимок вошедшего — тот же `MeResource`, что отдают вход, `/auth/me` и приём
// приглашения; тип берётся из схемы, чтобы расхождение с сервером роняло
// тайпчек, а не расходилось молча.
export type MeResponse = components['schemas']['MeResource']
export type MeUser = MeResponse['user']
export type MePerson = MeResponse['person']

// Фабрика, а не общий объект: каждый сброс получает свои пустые права, и
// правка словаря служений у одного снимка не протекает в следующий.
function emptyPermissions(): Permissions {
  return { administrator: false, global: [], ministries: {} }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeUser | null>(null)
  const person = ref<MePerson | null>(null)
  const permissions = ref<Permissions>(emptyPermissions())
  // Отличает "ещё не проверяли сессию после перезагрузки" от "проверили и
  // гостя": глобальный middleware дергает fetchMe один раз за загрузку
  // страницы, а не перед каждым переходом.
  const initialized = ref(false)
  // Сервер не ответил на `/auth/me` (сеть, 5xx при выкладке): это не ответ
  // «гость», поэтому сессия не сбрасывается, а экран показывает «Нет связи с
  // сервером» с повтором (ConnectionGate.vue). Сбрасывает флаг любой ответ
  // сервера о сессии: снимок вошедшего или 401.
  const connectionLost = ref(false)

  // Публично: экран приглашения (`pages/invite/[token].vue`) принимает
  // `POST /access-links/{token}/accept`, который для kind=invite логинит
  // аккаунт на сервере и отдаёт тот же `MeResource`, что и `/auth/login`
  // (docs/architecture.md:444, apps/api/.../MeResource.php `$wrap = null`).
  // Экран переиспользует эту функцию вместо второго похода за `/auth/me`.
  function setMe(me: MeResponse) {
    user.value = me.user
    person.value = me.person
    permissions.value = me.permissions
    connectionLost.value = false
  }

  function reset() {
    user.value = null
    person.value = null
    permissions.value = emptyPermissions()
    connectionLost.value = false
  }

  // Публично: экран сброса пароля (`pages/password-reset/[token].vue`) зовёт
  // это перед переходом на /login после успешного приёма ссылки. Сервер там
  // меняет состояние сессий по своим правилам, не по cookie этой вкладки
  // (AcceptAccessLink.php завершает все сессии аккаунта, чей пароль
  // сбросили, — а если ссылку сбросил кто-то ДРУГОЙ, уже вошедший в этой же
  // вкладке своим аккаунтом, тот чужой сессии вообще не касается). В обоих
  // случаях локальный `user` мог устареть, а простой reset() ещё и соврал
  // бы: он безусловно разлогинил бы вкладку, даже когда сервер её сессию не
  // трогал. Вместо угадывания — reset() плюс `initialized = false`, чтобы
  // ближайший прогон middleware (auth.global.ts) заново спросил сервер через
  // fetchMe() и восстановил ровно то, что там на самом деле: гостя для
  // сброшенного аккаунта или прежнего пользователя для стороннего.
  function forgetSession() {
    reset()
    initialized.value = false
  }

  async function login(loginValue: string, password: string, remember: boolean) {
    const api = useApi()
    const me = await api.post<MeResponse>('/auth/login', { login: loginValue, password, remember })
    setMe(me)
  }

  async function logout() {
    const api = useApi()
    try {
      await api.post('/auth/logout')
    } finally {
      reset()
    }
  }

  async function fetchMe() {
    const api = useApi()
    try {
      setMe(await api.get<MeResponse>('/auth/me'))
      initialized.value = true
    } catch (error) {
      if (apiErrorStatus(error) === 401) {
        // Сервер ответил: сессии нет. Это гость — middleware решит, вести ли
        // на /login.
        reset()
        initialized.value = true
        return
      }
      // Ответа о сессии нет. Вошедший остаётся вошедшим со своими правами;
      // первая проверка после загрузки остаётся незавершённой
      // (`initialized` не меняется), и следующий переход или «Повторить»
      // спросят сервер снова.
      connectionLost.value = true
    }
  }

  return { user, person, permissions, initialized, connectionLost, login, logout, fetchMe, reset, setMe, forgetSession }
})
