import type { components } from '~~/types/api'
import type { Permissions } from '~/composables/useCan'

// Снимок вошедшего — тот же `MeResource`, что отдают вход, `/auth/me` и приём
// приглашения; тип берётся из схемы, чтобы расхождение с сервером роняло
// тайпчек, а не расходилось молча.
export type MeResponse = components['schemas']['MeResource']
export type MeUser = MeResponse['user']
export type MePerson = MeResponse['person']

const emptyPermissions: Permissions = { administrator: false, global: [], ministries: {} }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeUser | null>(null)
  const person = ref<MePerson | null>(null)
  const permissions = ref<Permissions>({ ...emptyPermissions })
  // Отличает "ещё не проверяли сессию после перезагрузки" от "проверили и
  // гостя": глобальный middleware дергает fetchMe один раз за загрузку
  // страницы, а не перед каждым переходом.
  const initialized = ref(false)

  // Публично: экран приглашения (`pages/invite/[token].vue`) принимает
  // `POST /access-links/{token}/accept`, который для kind=invite логинит
  // аккаунт на сервере и отдаёт тот же `MeResource`, что и `/auth/login`
  // (docs/architecture.md:444, apps/api/.../MeResource.php `$wrap = null`).
  // Экран переиспользует эту функцию вместо второго похода за `/auth/me`.
  function setMe(me: MeResponse) {
    user.value = me.user
    person.value = me.person
    permissions.value = me.permissions
  }

  function reset() {
    user.value = null
    person.value = null
    permissions.value = { ...emptyPermissions }
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
      const me = await api.get<MeResponse>('/auth/me')
      setMe(me)
    } catch {
      // Сервер остаётся единственным источником правды: любая неудача (401,
      // сеть, что угодно) на этапе выяснения "кто вошёл" трактуется как
      // "гость" — middleware решит, вести ли на /login.
      reset()
    } finally {
      initialized.value = true
    }
  }

  return { user, person, permissions, initialized, login, logout, fetchMe, reset, setMe, forgetSession }
})
