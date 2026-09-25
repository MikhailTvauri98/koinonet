// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PersonCard from '~/pages/people/[id].vue'
import { useAuthStore } from '~/stores/auth'
import type { Person } from '~/utils/people'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const route = reactive({ params: { id: 'p1' } })
mockNuxtImport('useApi', () => () => ({ get, post, put, patch }))
mockNuxtImport('useRoute', () => () => route)
let pinia = createPinia()
let pages: VueWrapper[] = []
let card: Person
const roles = [{ id: 'r1', name: 'Читатель', scope: 'global', ministry_id: null, description: null, is_system: false, permissions: [] }]

function permit(...keys: string[]) {
  useAuthStore(pinia).permissions = { administrator: false, global: keys, ministries: {} }
}
async function mountPage() {
  const page = await mountSuspended(PersonCard, { global: { plugins: [pinia] } })
  pages.push(page)
  await flushPromises()
  return page
}
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  permit('people.view')
  route.params.id = 'p1'
  card = {
    id: 'p1', last_name: 'Прокопенко', first_name: 'Мария', patronymic: null,
    full_name: 'Прокопенко Мария', status: 'member', archived: false,
    has_account: false, has_global_roles: true, account_disabled: false, photo_url: null,
    global_roles: [{ id: 'r1', name: 'Читатель' }], ministries: [{ id: 'm1', name: 'Хор' }],
  }
  get.mockReset().mockImplementation((path: string) => Promise.resolve(path.startsWith('/roles') ? { data: roles } : { data: { ...card } }))
  post.mockReset().mockResolvedValue({ data: { url: 'https://church.test/invite/tok123', expires_at: '2026-10-02T12:00:00Z' } })
  patch.mockReset().mockResolvedValue({ data: {} })
  put.mockReset().mockResolvedValue({ data: { role_ids: ['r1'] } })
})
afterEach(() => {
  pages.forEach(page => page.unmount())
  pages = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('person card', () => {
  it('shows the name, status, photo, global roles and visible ministries', async () => {
    card.photo_url = '/photo.jpg'
    const page = await mountPage()
    expect(get).toHaveBeenCalledWith('/people/p1')
    expect(page.text()).toContain('Прокопенко Мария')
    expect(page.text()).toContain('Член церкви')
    expect(page.text()).toContain('Читатель')
    expect(page.text()).toContain('Хор')
    expect(page.get('[data-test="person-photo"]').attributes('src')).toBe('/photo.jpg')
  })

  it('omits contacts and note when the server hides them, including in edit mode', async () => {
    permit('people.view', 'people.manage', 'people.view_notes')
    const page = await mountPage()
    expect(page.find('[data-test="contacts"]').exists()).toBe(false)
    expect(page.find('[data-test="note"]').exists()).toBe(false)
    await page.get('[data-test="edit-person"]').trigger('click')
    expect(page.find('[name="phone"]').exists()).toBe(false)
    expect(page.find('[name="note"]').exists()).toBe(false)
    await page.get('[name="first_name"]').setValue('Анна')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith('/people/p1', {
      last_name: 'Прокопенко', first_name: 'Анна', patronymic: null, status: 'member',
    })
  })

  it('shows contacts exactly when returned, regardless of the global contact permission', async () => {
    card.contacts = { phone: '+79123456789', email: 'maria@example.com', birth_date: '1990-03-15' }
    card.note = 'Видимая заметка'
    const page = await mountPage()
    expect(page.get('[data-test="contacts"]').text()).toContain('+79123456789')
    expect(page.get('a[href="mailto:maria@example.com"]').text()).toContain('maria@example.com')
    expect(page.text()).toContain('15.03.1990')
    expect(page.get('[data-test="note"]').text()).toContain('Видимая заметка')
  })

  it('edits visible contacts and note without touching account credentials', async () => {
    permit('people.view', 'people.manage', 'people.view_notes')
    card.contacts = { phone: '+79123456789', email: null, birth_date: null }
    card.note = 'Заметка'
    const page = await mountPage()
    await page.get('[data-test="edit-person"]').trigger('click')
    expect((page.get('[name="phone"]').element as HTMLInputElement).value).toBe('+79123456789')
    await page.get('[name="phone"]').setValue('')
    await page.get('[name="note"]').setValue('Изменено')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(patch.mock.calls[0]![1]).toMatchObject({ phone: null, email: null, birth_date: null, note: 'Изменено' })
    expect(patch.mock.calls[0]![1]).not.toHaveProperty('password')
    expect(get.mock.calls.filter(([path]) => path === '/people/p1')).toHaveLength(2)
  })

  it('shows validation errors without closing the edit form', async () => {
    permit('people.view', 'people.manage')
    patch.mockRejectedValueOnce({ statusCode: 422, data: { errors: { first_name: ['Проверьте имя.'] } } })
    const page = await mountPage()
    await page.get('[data-test="edit-person"]').trigger('click')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.text()).toContain('Проверьте имя.')
    expect(page.find('form').exists()).toBe(true)
  })

  it('keeps editing enabled for an active person', async () => {
    permit('people.view', 'people.manage')
    const page = await mountPage()
    const button = page.get('[data-test="edit-person"]')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('disables editing an archived person and explains how to proceed', async () => {
    permit('people.view', 'people.manage')
    card.archived = true
    const page = await mountPage()
    const button = page.get('[data-test="edit-person"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('архива')
  })

  it('hides administrative actions without their permission keys', async () => {
    const page = await mountPage()
    for (const key of ['edit-person', 'archive', 'invite', 'password-reset', 'disable-account', 'edit-roles']) {
      expect(page.find(`[data-test="${key}"]`).exists()).toBe(false)
    }
  })

  it.each([
    [403, 'Нет права'], [404, 'Человек не найден'], [500, 'Не удалось загрузить'],
  ])('reports a %i card failure and offers retry', async (statusCode, message) => {
    get.mockRejectedValueOnce({ statusCode })
    const page = await mountPage()
    expect(page.text()).toContain(message)
    expect(page.text()).not.toContain('Прокопенко')
    await page.get('[data-test="retry-card"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Прокопенко Мария')
  })

  it('refreshes hidden data after permission changes and ignores stale requests', async () => {
    card.contacts = { phone: '+79123456789', email: null, birth_date: null }
    const page = await mountPage()
    let finish!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    route.params.id = 'p2'
    await flushPromises()
    expect(page.find('[data-test="contacts"]').exists()).toBe(false)
    card = { ...card, id: 'p3', full_name: 'Новый человек', contacts: undefined }
    route.params.id = 'p3'
    await flushPromises()
    finish({ data: { ...card, id: 'p2', full_name: 'Устаревший человек' } })
    await flushPromises()
    expect(page.text()).toContain('Новый человек')
    expect(page.text()).not.toContain('Устаревший человек')
    permit()
    await flushPromises()
    expect(page.text()).not.toContain('Новый человек')
  })

  it('removes contacts when contact rights change while directory access remains', async () => {
    permit('people.view', 'people.view_contacts')
    card.contacts = { phone: '+79123456789', email: null, birth_date: null }
    const page = await mountPage()
    expect(page.find('[data-test="contacts"]').exists()).toBe(true)
    delete card.contacts
    permit('people.view')
    await flushPromises()
    expect(page.find('[data-test="contacts"]').exists()).toBe(false)
    expect(page.text()).toContain('Прокопенко Мария')
  })

  it.each(['edit', 'roles'])('does not interrupt another card when an old %s save finishes', async (kind) => {
    permit('people.view', 'people.manage', 'roles.manage_global')
    const page = await mountPage()
    let finish!: (value: unknown) => void
    const method = kind === 'edit' ? patch : put
    method.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await page.get(`[data-test="${kind === 'edit' ? 'edit-person' : 'edit-roles'}"]`).trigger('click')
    await flushPromises()
    await page.get('form').trigger('submit')
    card = { ...card, id: 'p2', full_name: 'Другой человек' }
    route.params.id = 'p2'
    await flushPromises()
    await page.get('[data-test="edit-person"]').trigger('click')
    await page.get('[name="first_name"]').setValue('Несохранённое имя')
    finish({ data: {} })
    await flushPromises()
    expect(page.find('form').exists()).toBe(true)
    expect((page.get('[name="first_name"]').element as HTMLInputElement).value).toBe('Несохранённое имя')
  })

  it('requires confirmation to archive and can restore the resulting card', async () => {
    permit('people.view', 'people.manage')
    const page = await mountPage()
    await page.get('[data-test="archive"]').trigger('click')
    expect(post).not.toHaveBeenCalled()
    await page.get('[data-test="cancel-action"]').trigger('click')
    expect(post).not.toHaveBeenCalled()
    await page.get('[data-test="archive"]').trigger('click')
    card.archived = true
    await page.get('[data-test="confirm-action"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/archive')
    expect(page.text()).toContain('В архиве')
    card.archived = false
    await page.get('[data-test="restore"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/restore')
  })
})

describe('account actions', () => {
  beforeEach(() => { permit('people.view', 'people.invite') })

  it.each([
    [{ has_global_roles: false }, 'глобальную роль'],
    [{ has_account: true }, 'уже есть аккаунт'],
    [{ archived: true }, 'архиве'],
  ])('explains an unavailable invitation for %j', async (over, reason) => {
    Object.assign(card, over)
    const page = await mountPage()
    expect(page.get('[data-test="invite"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-test="invite"]').attributes('title')).toContain(reason)
  })

  it('generates, copies and discards the invitation and renders its QR locally', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const page = await mountPage()
    await page.get('[data-test="invite"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/invite')
    expect(page.get('[data-test="invite-link"]').text()).toContain('/invite/tok123')
    expect(decodeURIComponent(page.get('[data-test="link-qr"]').attributes('src')!)).toContain('<svg')
    await page.get('[data-test="copy-invite-link"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('https://church.test/invite/tok123')
    expect(page.text()).toContain('Скопировано')
    await page.get('[data-test="close-link"]').trigger('click')
    expect(page.find('[data-test="invite-link"]').exists()).toBe(false)
    expect(page.find('[data-test="link-qr"]').exists()).toBe(false)
  })

  it('keeps the link selectable if clipboard access fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const page = await mountPage()
    await page.get('[data-test="invite"]').trigger('click')
    await flushPromises()
    await page.get('[data-test="copy-invite-link"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Скопируйте ссылку вручную')
    expect(page.get('[data-test="invite-link"]').text()).toContain('/invite/tok123')
  })

  it('creates a password reset link only for an existing account', async () => {
    card.has_account = true
    post.mockResolvedValueOnce({ data: { url: 'https://church.test/password-reset/reset123', expires_at: '2026-09-26T12:00:00Z' } })
    const page = await mountPage()
    await page.get('[data-test="password-reset"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/password-reset-link')
    expect(page.text()).toContain('/password-reset/reset123')
  })

  it('confirms disabling and then offers enabling the account', async () => {
    card.has_account = true
    const page = await mountPage()
    await page.get('[data-test="disable-account"]').trigger('click')
    expect(post).not.toHaveBeenCalled()
    card.account_disabled = true
    await page.get('[data-test="confirm-account"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/disable')
    expect(page.find('[data-test="enable-account"]').exists()).toBe(true)
    card.account_disabled = false
    await page.get('[data-test="enable-account"]').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people/p1/enable')
  })

  it('goes to login after disabling the account currently signed in', async () => {
    card.has_account = true
    const auth = useAuthStore(pinia)
    auth.person = { id: 'p1', last_name: 'Прокопенко', first_name: 'Мария' }
    auth.user = { id: 'u1', phone: null, email: 'maria@example.com' }
    auth.initialized = true
    get.mockImplementation((path: string) => path === '/auth/me'
      ? Promise.reject({ statusCode: 401 }) : Promise.resolve({ data: { ...card } }))
    const push = vi.spyOn(useRouter(), 'push').mockResolvedValue(undefined)
    const page = await mountPage()
    await page.get('[data-test="disable-account"]').trigger('click')
    await page.get('[data-test="confirm-account"]').trigger('click')
    await flushPromises()
    expect(auth.user).toBeNull()
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('shows a server rule violation and prevents repeated submissions', async () => {
    let reject!: (value: unknown) => void
    post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const page = await mountPage()
    await page.get('[data-test="invite"]').trigger('click')
    await page.get('[data-test="invite"]').trigger('click')
    expect(post).toHaveBeenCalledTimes(1)
    reject({ statusCode: 422, data: { code: 'invite.person_has_no_global_role', message: 'Сначала выдайте глобальную роль.' } })
    await flushPromises()
    expect(page.text()).toContain('Сначала выдайте глобальную роль.')
    expect(page.find('[data-test="invite-link"]').exists()).toBe(false)
  })

  it('clears an issued secret when the card changes', async () => {
    const page = await mountPage()
    await page.get('[data-test="invite"]').trigger('click')
    await flushPromises()
    route.params.id = 'p2'
    card = { ...card, id: 'p2' }
    await flushPromises()
    expect(page.text()).not.toContain('tok123')
  })
})

describe('global role assignment', () => {
  beforeEach(() => { permit('people.view', 'roles.manage_global') })

  it('loads role choices only on editing and submits explicit ids', async () => {
    const page = await mountPage()
    expect(get).not.toHaveBeenCalledWith('/roles?scope=global')
    await page.get('[data-test="edit-roles"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/roles?scope=global')
    expect((page.get('[data-test="role-r1"]').element as HTMLInputElement).checked).toBe(true)
    await page.get('[data-test="role-r1"]').setValue(false)
    card.global_roles = []
    card.has_global_roles = false
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/people/p1/roles', { role_ids: [] })
    expect(page.text()).toContain('Нет глобальных ролей')
  })

  it('preserves the selected roles on a server invariant error', async () => {
    put.mockRejectedValueOnce({ statusCode: 422, data: { message: 'Нельзя снять роль с последнего администратора.' } })
    const page = await mountPage()
    await page.get('[data-test="edit-roles"]').trigger('click')
    await flushPromises()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.text()).toContain('Нельзя снять роль')
    expect(page.find('[data-test="role-r1"]').exists()).toBe(true)
  })
})
