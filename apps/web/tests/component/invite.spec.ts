// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvitePage from '~/pages/invite/[token].vue'

const get = vi.fn()
const post = vi.fn()
const push = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useRoute', () => () => ({ params: { token: 'tok123' } }))
// mockNuxtImport заменяет useRouter везде в модульном графе файла, включая
// служебный код @nuxt/test-utils (setupNuxt зовёт useRouter().afterEach,
// mountSuspended — useRouter().replace) и плагин Nuxt navigation-repaint
// (router.beforeResolve) — все падают на голом `{ push }` с nuxt@4.5.2 +
// @nuxt/test-utils@4.3.2. Заглушки-пустышки ничего не проверяют и не влияют
// на assertions ниже (те смотрят только push). Приём и комментарий — из
// tests/component/login.spec.ts (задачи 24-25 уже нашли и обошли этот дефект
// плана).
mockNuxtImport('useRouter', () => () => ({
  push,
  replace: () => {},
  afterEach: () => {},
  beforeResolve: () => {},
}))

beforeEach(() => {
  // Страница приглашения обращается к настоящему authStore (не мокается
  // здесь, в отличие от login.spec.ts), чтобы после успешного приёма
  // залогинить человека в сторе тем же способом, что и authStore.login() —
  // useAuthStore() без активной Pinia падает с "no active Pinia" вне
  // компонента, mountSuspended сам её не создаёт (тот же приём, что в
  // tests/unit/auth.store.spec.ts и tests/unit/useApi.spec.ts).
  setActivePinia(createPinia())
  get.mockReset()
  post.mockReset()
  push.mockReset()
})

function apiError(code: string) {
  return Object.assign(new Error('failed'), { data: { code, message: 'Ошибка' }, statusCode: 422 })
}

describe('invite page', () => {
  it('greets the invited person by name', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария', last_name: 'Иванова' }, login_hint: {} } })

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Мария')
  })

  it('prefills the login from the person card', async () => {
    get.mockResolvedValue({
      data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: { phone: '+79123456789' } },
    })

    const page = await mountSuspended(InvitePage)

    expect((page.find('[data-test="login"]').element as HTMLInputElement).value).toBe('+79123456789')
  })

  it('shows a clear message for an expired link', async () => {
    get.mockRejectedValue(apiError('access_link.expired'))

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Срок действия ссылки истёк')
  })

  it('shows a clear message for a used link', async () => {
    get.mockRejectedValue(apiError('access_link.used'))

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Ссылка уже использована')
  })

  it('rejects a password-reset link opened as an invitation', async () => {
    // GET сам по себе не падает — ссылка существует и годна, просто не того
    // вида. Экран приглашения не должен показать форму сброса пароля.
    get.mockResolvedValue({ data: { kind: 'password_reset', person: { first_name: 'Мария' }, login_hint: {} } })

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Ссылка недействительна')
    expect(page.find('form').exists()).toBe(false)
  })

  it('requires the password twice before sending anything', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: {} } })

    const page = await mountSuspended(InvitePage)
    await page.find('[data-test="login"]').setValue('maria@example.com')
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret124')
    await page.find('form').trigger('submit')

    expect(post).not.toHaveBeenCalled()
    expect(page.text()).toContain('Пароли не совпадают')
  })

  it('goes to the home page after accepting', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: {} } })
    // POST /access-links/{token}/accept при kind=invite отдаёт MeResource
    // (apps/api/.../MeResource.php: `public static $wrap = null;`) без
    // обёртки `data` — так же, как /auth/login и /auth/me (~~/types/api,
    // операция accessLink.accept, ответ 201). Бриф задачи 26 предполагал
    // обёртку `{ data: { user: {...} } }` по аналогии с GET-ответом; это
    // дефект плана, тот же класс, что и два уже описанных в задаче.
    post.mockResolvedValue({
      user: { id: 'u1', phone: null, email: 'maria@example.com' },
      person: { id: 'p1', first_name: 'Мария', last_name: 'Иванова', patronymic: null, status: 'member' },
      permissions: { administrator: false, global: [], ministries: {} },
    })

    const page = await mountSuspended(InvitePage)
    await page.find('[data-test="login"]').setValue('maria@example.com')
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret123')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/access-links/tok123/accept', expect.objectContaining({
      login: 'maria@example.com',
      password: 'secret123',
    }))
    expect(push).toHaveBeenCalledWith('/')
  })
})
