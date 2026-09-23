// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PasswordResetPage from '~/pages/password-reset/[token].vue'
import { useAuthStore } from '~/stores/auth'

const get = vi.fn()
const post = vi.fn()
const push = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useRoute', () => () => ({ params: { token: 'tok123' } }))
// Тот же дефект плана, что и на экране приглашения (tests/component/invite.spec.ts,
// tests/component/login.spec.ts): голый `{ push }` роняет собственную
// настройку @nuxt/test-utils и плагин navigation-repaint под
// nuxt@4.5.2 + @nuxt/test-utils@4.3.2.
mockNuxtImport('useRouter', () => () => ({
  push,
  replace: () => {},
  afterEach: () => {},
  beforeResolve: () => {},
}))

beforeEach(() => {
  // Страница обращается к настоящему authStore (forgetSession() перед
  // переходом на /login) — тот же приём, что в invite.spec.ts.
  setActivePinia(createPinia())
  get.mockReset()
  post.mockReset()
  push.mockReset()
})

function apiError(code: string) {
  return Object.assign(new Error('failed'), { data: { code, message: 'Ошибка' }, statusCode: 422 })
}

describe('password reset page', () => {
  it('shows a clear message for an invalid link', async () => {
    get.mockRejectedValue(apiError('access_link.invalid'))

    const page = await mountSuspended(PasswordResetPage)

    expect(page.text()).toContain('Ссылка недействительна')
  })

  it('rejects an invite link opened as a password reset', async () => {
    // GET сам по себе не падает — ссылка существует и годна, просто не того
    // вида. Экран сброса пароля не должен показать форму приглашения (с
    // полем логина).
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: {} } })

    const page = await mountSuspended(PasswordResetPage)

    expect(page.text()).toContain('Ссылка недействительна')
    expect(page.find('form').exists()).toBe(false)
  })

  it('requires the password twice before sending anything', async () => {
    get.mockResolvedValue({ data: { kind: 'password_reset', person: { first_name: 'Мария' }, login_hint: {} } })

    const page = await mountSuspended(PasswordResetPage)
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret124')
    await page.find('form').trigger('submit')

    expect(post).not.toHaveBeenCalled()
    expect(page.text()).toContain('Пароли не совпадают')
  })

  it('goes to the login page with a notice after resetting', async () => {
    get.mockResolvedValue({ data: { kind: 'password_reset', person: { first_name: 'Мария' }, login_hint: {} } })
    // Ответ 200 при kind=password_reset — `{ data: { kind: 'password_reset' } }`
    // (~~/types/api, операция accessLink.accept), без пользователя и без
    // сессии: AcceptAccessLink.php не логинит для этого вида ссылки.
    post.mockResolvedValue({ data: { kind: 'password_reset' } })

    const page = await mountSuspended(PasswordResetPage)
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret123')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/access-links/tok123/accept', {
      password: 'secret123',
      password_confirmation: 'secret123',
    })
    expect(push).toHaveBeenCalledWith('/login?passwordChanged=1')
  })

  it('invalidates a stale signed-in session before leaving for the login screen', async () => {
    // Вкладка была вошедшей КАКИМ-ТО аккаунтом до отправки — экран не
    // пытается угадать, свой это аккаунт или чужой (сервер решит по
    // fetchMe() на /login, apps/web/tests/unit/auth.store.spec.ts проверяет
    // оба исхода); он обязан сбросить локальное состояние безусловно, а не
    // тащить его дальше как есть.
    const auth = useAuthStore()
    auth.user = { id: 'admin1', phone: null, email: 'admin@example.com' }
    auth.initialized = true

    get.mockResolvedValue({ data: { kind: 'password_reset', person: { first_name: 'Мария' }, login_hint: {} } })
    post.mockResolvedValue({ data: { kind: 'password_reset' } })

    const page = await mountSuspended(PasswordResetPage)
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret123')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(auth.user).toBeNull()
    expect(auth.initialized).toBe(false)
  })
})
