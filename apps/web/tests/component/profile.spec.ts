// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppNav from '~/components/AppNav.vue'
import DevicesPage from '~/pages/settings/devices.vue'
import LoginSettingsPage from '~/pages/settings/login.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import ProfilePage from '~/pages/settings/profile.vue'
import { useAuthStore, type MeResponse } from '~/stores/auth'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, put, patch, delete: del }))

const me: MeResponse = {
  user: { id: 'u1', phone: null, email: 'maria@example.com', ical_url: 'https://church.test/calendar.ics' },
  person: { id: 'p1', last_name: 'Прокопенко', first_name: 'Мария', patronymic: null, status: 'member' },
  permissions: { administrator: false, global: [], ministries: {} },
}

// Смонтированный экран прошлого теста живёт дальше и реагирует на права,
// которые следующий тест пишет в тот же стор, — поэтому экраны снимаются
// после каждого теста.
enableAutoUnmount(afterEach)

beforeEach(() => {
  [get, post, put, patch, del].forEach(fn => fn.mockReset())
  grantPermissions()
})

// Упавшее ожидание в тесте с поддельными таймерами не должно оставить их
// следующим тестам.
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  it.each([
    [{ id: 'p1', photo_url: '/new-photo.webp' }, '/new-photo.webp'],
    [{ id: 'p1' }, '/current-photo.webp'],
  ])('uses photo data only when the attachment response includes it', async (resource, expectedPhoto) => {
    get.mockResolvedValue({ data: { photo_url: '/current-photo.webp', contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } })
    const page = await mountSuspended(ProfilePage)

    page.findComponent(MediaUploader).vm.$emit('attached', resource)
    await flushPromises()

    expect(page.find('[data-test="photo"]').attributes('src')).toBe(expectedPhoto)
  })

  it('sends the contacts_public toggle', async () => {
    // После записи экран перечитывает и профиль, и `/auth/me` — у каждого
    // свой ответ, иначе стор получил бы профиль вместо снимка вошедшего.
    get.mockImplementation((path: string) => Promise.resolve(path === '/auth/me'
      ? me
      : { data: { contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } }))
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(ProfilePage)
    await page.find('[data-test="contacts-public"]').setValue(true)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/profile', expect.objectContaining({ contacts_public: true }))
  })
})

describe('logout', () => {
  function mockProfile() {
    get.mockResolvedValue({ data: { photo_url: null, contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } })
  }

  it('ends the session on the server, clears the store and goes to the login screen', async () => {
    mockProfile()
    post.mockResolvedValue(undefined)
    const push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)

    const page = await mountSuspended(ProfilePage)
    await page.find('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(useAuthStore().user).toBeNull()
    expect(useAuthStore().permissions.global).toEqual([])
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('stays signed in and explains when the server did not end the session', async () => {
    mockProfile()
    post.mockRejectedValue(new TypeError('Failed to fetch'))
    const push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)

    const page = await mountSuspended(ProfilePage)
    await page.find('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(page.find('[data-test="logout-error"]').text()).toBe('Не удалось выйти. Попробуйте ещё раз.')
    expect(useAuthStore().user).not.toBeNull()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('media uploader', () => {
  it('waits for processing before attaching the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValueOnce({ data: { id: 'md1', status: 'processing' } })
      .mockResolvedValueOnce({ data: { id: 'md1', status: 'ready', url: '/api/v1/media/md1?signature=x' } })
    put.mockResolvedValue({ data: {} })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
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
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open]').find('a[href^="/admin/"]').exists()).toBe(false)
  })

  it('shows the admin section with audit.view', async () => {
    grantPermissions({ global: ['audit.view'] })

    const nav = await mountSuspended(AppNav)

    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(true)
    await nav.get('[data-test="nav-more"]').trigger('click')
    expect(nav.get('dialog[open]').find('a[href="/admin/audit"]').exists()).toBe(true)
    expect(nav.get('dialog[open]').find('a[href="/admin/settings"]').exists()).toBe(false)
  })
})


describe('grouped profile and confirmed saves', () => {
  it('groups photo, contacts and visibility without editable name or status', async () => {
    get.mockResolvedValue({ data: { contacts: {}, contacts_public: false } })
    const page = await mountSuspended(ProfilePage)
    expect(page.findAll('h2').map(heading => heading.text())).toEqual(expect.arrayContaining(['Фото', 'Контакты', 'Видимость контактов']))
    expect(page.find('input[name=first_name], input[name=status]').exists()).toBe(false)
  })

  it('normalizes confirmed contacts through a fresh GET and preserves success on read failure with retry', async () => {
    const profile = { contacts: { phone: 'old', email: null, birth_date: null }, contacts_public: false }
    get.mockResolvedValueOnce({ data: profile }).mockRejectedValueOnce(new Error('read failed'))
    patch.mockResolvedValue({ data: { id: 'p1' } })
    const page = await mountSuspended(ProfilePage)
    await page.get('input[name=phone]').setValue('8 (999) 123-45-67')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.get('[data-test=profile-saved]').text()).toContain('Сохранено')
    expect((page.get('input[name=phone]').element as HTMLInputElement).value).toBe('8 (999) 123-45-67')
    get.mockResolvedValue({ data: { ...profile, contacts: { ...profile.contacts, phone: '+79991234567' } } })
    await page.get('[data-test=retry-profile-refresh]').trigger('click')
    await flushPromises()
    expect((page.get('input[name=phone]').element as HTMLInputElement).value).toBe('+79991234567')
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite newer draft changes with a delayed normalized GET', async () => {
    const profile = { contacts: { phone: 'old', email: null, birth_date: null }, contacts_public: false }
    let release!: (value: unknown) => void
    get.mockResolvedValueOnce({ data: profile }).mockImplementation((path: string) => path === '/auth/me' ? Promise.reject(new Error('unrelated refresh unavailable')) : new Promise(resolve => { release = resolve }))
    patch.mockResolvedValue({ data: { id: 'p1' } })
    const page = await mountSuspended(ProfilePage)
    await page.get('input[name=phone]').setValue('submitted')
    await page.get('form').trigger('submit')
    await flushPromises()
    await page.get('input[name=phone]').setValue('newer draft')
    release({ data: { ...profile, contacts: { ...profile.contacts, phone: 'normalized', email: 'normalized@example.test' } } })
    await flushPromises()
    expect((page.get('input[name=phone]').element as HTMLInputElement).value).toBe('newer draft')
    expect(page.get('[data-test=profile-saved]').text()).toContain('Сохранено')
    expect((page.get('input[name=email]').element as HTMLInputElement).value).toBe('normalized@example.test')
  })

  it('ignores pending save errors across logout/relogin of the same account', async () => {
    get.mockResolvedValue({ data: { contacts: {}, contacts_public: false } })
    let reject!: (reason: unknown) => void
    patch.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
    const page = await mountSuspended(ProfilePage)
    await page.get('form').trigger('submit')
    useAuthStore().sessionVersion++
    await flushPromises()
    await page.get('input[name=phone]').setValue('new session')
    reject(new Error('old session failed'))
    await flushPromises()
    expect(page.text()).not.toContain('Не удалось сохранить профиль')
    expect((page.get('input[name=phone]').element as HTMLInputElement).value).toBe('new session')
  })

  it('keeps field input and associates server errors with the field', async () => {
    get.mockResolvedValue({ data: { contacts: {}, contacts_public: false } })
    patch.mockRejectedValue({ statusCode: 422, data: { errors: { phone: ['Проверьте телефон.'] } } })
    const page = await mountSuspended(ProfilePage)
    await page.get('input[name=phone]').setValue('wrong')
    await page.get('form').trigger('submit')
    await flushPromises()
    const input = page.get('input[name=phone]')
    expect((input.element as HTMLInputElement).value).toBe('wrong')
    expect(input.attributes('aria-labelledby')).toBeTruthy()
    expect(page.get('#' + input.attributes('aria-labelledby')).text()).toBe('Телефон')
    expect(input.attributes('aria-describedby')).toBeTruthy()
    expect(page.get('#' + input.attributes('aria-describedby')).text()).toBe('Проверьте телефон.')
  })
})


it('keeps a confirmed device removal when refreshing the server list would fail', async () => {
  get.mockResolvedValueOnce({ data: [
    { id: 's1', current: true, user_agent: 'Chrome', ip_address: null, last_activity: null },
    { id: 's2', current: false, user_agent: 'Edge', ip_address: null, last_activity: null },
  ] }).mockRejectedValue(new Error('refresh failed'))
  del.mockResolvedValue(undefined)
  const page = await mountSuspended(DevicesPage)
  await page.get('[data-test=end-s2]').trigger('click')
  await flushPromises()
  expect(page.find('[data-test=end-s2]').exists()).toBe(false)
  expect(page.find('[data-test=end-s1]').exists()).toBe(true)
  expect(page.get('[role=status]').text()).toContain('Устройство завершено')
})


it('ignores a device operation from a prior session even for the same account', async () => {
  get.mockResolvedValue({ data: [{ id: 's2', current: false, user_agent: 'Edge', ip_address: null, last_activity: null }] })
  let reject!: (reason: unknown) => void
  del.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  const page = await mountSuspended(DevicesPage)
  await page.get('[data-test=end-s2]').trigger('click')
  useAuthStore().sessionVersion++
  await flushPromises()
  reject(new Error('old device request failed'))
  await flushPromises()
  expect(page.text()).not.toContain('Не удалось завершить это устройство')
  expect(page.find('[data-test=end-s2]').attributes('disabled')).toBeUndefined()
})


it('does not refresh profile or authentication after a save resolves on an unmounted page', async () => {
  get.mockResolvedValue({ data: { contacts: {}, contacts_public: false } })
  let resolve!: (value: unknown) => void
  patch.mockImplementation(() => new Promise(done => { resolve = done }))
  const page = await mountSuspended(ProfilePage)
  const refresh = vi.spyOn(useAuthStore(), 'fetchMe')
  await page.get('form').trigger('submit')
  page.unmount()
  resolve({ data: { id: 'p1' } })
  await flushPromises()
  expect(get).toHaveBeenCalledTimes(1)
  expect(refresh).not.toHaveBeenCalled()
})


it('preserves draft and confirmed save across an unrelated same-account permissions refresh', async () => {
  get.mockImplementation((path: string) => path === '/auth/me'
    ? Promise.resolve({ user: useAuthStore().user, person: useAuthStore().person, permissions: useAuthStore().permissions })
    : Promise.resolve({ data: { contacts: { phone: 'server', email: null, birth_date: null }, contacts_public: false } }))
  let resolve!: (value: unknown) => void
  patch.mockImplementation(() => new Promise(done => { resolve = done }))
  const page = await mountSuspended(ProfilePage)
  await page.get('input[name=phone]').setValue('submitted')
  await page.get('form').trigger('submit')
  await page.get('input[name=phone]').setValue('new draft')
  grantPermissions({ global: ['people.view'] })
  await flushPromises()
  resolve({ data: { id: 'p1' } })
  await flushPromises()
  expect((page.get('input[name=phone]').element as HTMLInputElement).value).toBe('new draft')
  expect(page.get('[data-test=profile-saved]').text()).toContain('Сохранено')
})
