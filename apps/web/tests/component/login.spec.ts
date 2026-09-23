// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '~/pages/login.vue'

const login = vi.fn()
const push = vi.fn()
let routeQuery: Record<string, string> = {}

mockNuxtImport('useAuthStore', () => () => ({ login }))
// Страница сброса пароля (pages/password-reset/[token].vue) ведёт сюда с
// ?passwordChanged=1 — заглушка достаточно настоящая, чтобы это проверить,
// но не завязана на реальный vue-router (routeQuery меняется по тесту).
mockNuxtImport('useRoute', () => () => ({ query: routeQuery }))
// mockNuxtImport заменяет useRouter везде в модульном графе файла, включая
// служебный код @nuxt/test-utils (setupNuxt зовёт useRouter().afterEach,
// mountSuspended — useRouter().replace) и плагин Nuxt navigation-repaint
// (router.beforeResolve) — все падают на голом `{ push }` с nuxt@4.5.2 +
// @nuxt/test-utils@4.3.2. Заглушки-пустышки ничего не проверяют и не влияют
// на assertions ниже (те смотрят только push).
mockNuxtImport('useRouter', () => () => ({
  push,
  replace: () => {},
  afterEach: () => {},
  beforeResolve: () => {},
}))

beforeEach(() => {
  login.mockReset()
  push.mockReset()
  routeQuery = {}
})

describe('login page', () => {
  it('shows the validation message from a 422', async () => {
    login.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { message: 'Неверный логин или пароль.', errors: { login: ['Неверный логин или пароль.'] } },
    }))

    const page = await mountSuspended(LoginPage)
    await page.find('[data-test="login"]').setValue('ivan@example.com')
    await page.find('[data-test="password"]').setValue('nope')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Неверный логин или пароль')
    expect(push).not.toHaveBeenCalled()
  })

  it('explains a disabled account separately', async () => {
    login.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'auth.account_disabled', message: 'Аккаунт отключён.' },
    }))

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Аккаунт отключён')
  })

  it('blocks the button while the request is in flight', async () => {
    let release: () => void = () => {}
    login.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')

    expect(page.find('[data-test="submit"]').attributes('disabled')).toBeDefined()

    release()
    await new Promise(resolve => setTimeout(resolve))
  })

  it('goes to the home page after a successful login', async () => {
    login.mockResolvedValue(undefined)

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(push).toHaveBeenCalledWith('/')
  })

  it('explains why the person landed here after a password reset', async () => {
    routeQuery = { passwordChanged: '1' }

    const page = await mountSuspended(LoginPage)

    expect(page.text()).toContain('Пароль изменён')
  })
})
