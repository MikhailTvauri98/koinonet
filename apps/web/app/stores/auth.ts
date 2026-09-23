import type { Permissions } from '~/composables/useCan'

export interface MeUser {
  id: string
  phone: string | null
  email: string | null
}

export interface MePerson {
  id: string
  last_name: string
  first_name: string
  patronymic?: string | null
  status?: string
}

export interface MeResponse {
  user: MeUser
  person: MePerson
  permissions: Permissions
}

const emptyPermissions: Permissions = { administrator: false, global: [], ministries: {} }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeUser | null>(null)
  const person = ref<MePerson | null>(null)
  const permissions = ref<Permissions>({ ...emptyPermissions })
  // Отличает "ещё не проверяли сессию после перезагрузки" от "проверили и
  // гостя": глобальный middleware дергает fetchMe один раз за загрузку
  // страницы, а не перед каждым переходом.
  const initialized = ref(false)

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

  return { user, person, permissions, initialized, login, logout, fetchMe, reset }
})
