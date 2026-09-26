// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppNav from '~/components/AppNav.vue'
import DevicesPage from '~/pages/settings/devices.vue'
import LoginSettingsPage from '~/pages/settings/login.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import ProfilePage from '~/pages/settings/profile.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} }

mockNuxtImport('useApi', () => () => ({ get, post, put, patch, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
// Тот же приём, что в login.spec.ts/invite.spec.ts: mockNuxtImport подменяет
// useRouter везде в модульном графе файла, включая служебный код
// @nuxt/test-utils (afterEach/replace) и плагин навигации (beforeResolve) —
// без заглушек рядом с push они падают на голом `{ push }`.
mockNuxtImport('useRouter', () => () => ({
  push: () => {},
  replace: () => {},
  afterEach: () => {},
  beforeResolve: () => {},
}))

beforeEach(() => {
  [get, post, put, patch, del].forEach(fn => fn.mockReset())
  permissions.global = []
  // Дефект плана: бриф не заводит Pinia, но `AppNav` зовёт настоящий
  // `useHasVisibleMinistries()` (useCan.ts), а он — настоящий
  // `useAuthStore()`, а не замоканный `useCan()` из этого файла (то же
  // самое затрагивает fetchMe() у settings/profile.vue и settings/login.vue
  // после успешной записи) — без активной Pinia он падает на
  // "getActivePinia() was called but there was no active Pinia", как и в
  // person-card.spec.ts.
  setActivePinia(createPinia())
})

describe('login settings', () => {
  it('shows the taken-login error next to the field', async () => {
    patch.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'login.taken', message: 'Этот логин уже занят.' },
    }))

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="login"]').setValue('taken@example.com')
    await page.find('[data-test="login-current-password"]').setValue('password')
    await page.find('[data-test="login-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="login-error"]').text()).toContain('уже занят')
  })

  it('sends the current password together with the new login', async () => {
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="login"]').setValue('new@example.com')
    await page.find('[data-test="login-current-password"]').setValue('password')
    await page.find('[data-test="login-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/login', { login: 'new@example.com', current_password: 'password' })
  })
})

describe('profile', () => {
  it('sends the contacts_public toggle', async () => {
    get.mockResolvedValue({ data: { contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } })
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(ProfilePage)
    await page.find('[data-test="contacts-public"]').setValue(true)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/profile', expect.objectContaining({ contacts_public: true }))
  })
})

describe('media uploader', () => {
  it('waits for processing before attaching the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValueOnce({ data: { id: 'md1', status: 'processing' } })
      .mockResolvedValueOnce({ data: { id: 'md1', status: 'ready', url: '/api/v1/media/md1?signature=x' } })
    put.mockResolvedValue({ data: {} })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(put).toHaveBeenCalledWith('/me/photo', { media_id: 'md1' })
    vi.useRealTimers()
  })
})

describe('devices', () => {
  it('marks the current session and disables ending it', async () => {
    get.mockResolvedValue({
      data: [
        { id: 's1', ip_address: '10.0.0.1', user_agent: 'iPhone', last_activity: '2026-09-12T10:00:00Z', current: true },
        { id: 's2', ip_address: '10.0.0.2', user_agent: 'Chrome', last_activity: '2026-09-12T09:00:00Z', current: false },
      ],
    })

    const page = await mountSuspended(DevicesPage)

    expect(page.find('[data-test="end-s1"]').attributes('disabled')).toBeDefined()
    expect(page.find('[data-test="end-s2"]').attributes('disabled')).toBeUndefined()
  })

  it('ends all other sessions', async () => {
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({})

    const page = await mountSuspended(DevicesPage)
    await page.find('[data-test="logout-others"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/auth/sessions/logout-others')
  })
})

describe('navigation', () => {
  it('hides the admin section without settings.manage and audit.view', async () => {
    const nav = await mountSuspended(AppNav)

    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(false)
  })

  it('shows the admin section with audit.view', async () => {
    permissions.global = ['audit.view']

    const nav = await mountSuspended(AppNav)

    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(true)
  })
})
