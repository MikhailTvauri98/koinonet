// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components, operations } from '~~/types/api'
import { useAuthStore } from '~/stores/auth'
import PeopleIndex from '~/pages/people/index.vue'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
const post = vi.fn()
mockNuxtImport('useApi', () => () => ({ get, post }))

type Person = components['schemas']['PersonResource']
type PeopleResponse = operations['person.index']['responses'][200]['content']['application/json']
const ministryId = '01J00000000000000000000001'
const person = (over: Partial<Person> = {}): Person => ({
  id: '01J00000000000000000000002', last_name: 'Прокопенко', first_name: 'Мария',
  patronymic: null, full_name: 'Прокопенко Мария', status: 'member', archived: false,
  has_account: false, user_id: null, has_global_roles: false, account_disabled: false, photo_url: null, ...over,
})
function result(data = [person()], page = 1, last = 1): PeopleResponse {
  return {
    data, links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: page, last_page: last, total: data.length, per_page: 25,
      from: data.length ? 1 : null, to: data.length || null, links: [], path: '/api/v1/people' },
  }
}
const peopleCalls = () => get.mock.calls.filter(([path]) => path.startsWith('/people'))
const lastQuery = () => new URL(peopleCalls().at(-1)![0], 'https://church.test').searchParams
let pages: VueWrapper[] = []
let testPinia = createPinia()
async function mountPage() {
  const page = await mountSuspended(PeopleIndex, { global: { plugins: [testPinia] } })
  pages.push(page)
  await flushPromises()
  return page
}
function permit(...keys: string[]) {
  grantPermissions({ global: keys }, testPinia)
}
beforeEach(() => {
  testPinia = createPinia()
  setActivePinia(testPinia)
  permit('people.view')
  get.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/ministries'
    ? { data: [{ id: ministryId, name: 'Хор', description: null, cover_url: null, default_role_id: null, archived_at: null }] }
    : result()))
  post.mockReset().mockResolvedValue({ data: person(), warnings: [] })
})
afterEach(() => {
  pages.forEach(page => page.unmount())
  pages = []
  vi.useRealTimers()
})

describe('people list', () => {
  it('does not load or expose the directory without people.view', async () => {
    permit('people.manage')
    const page = await mountPage()
    expect(get).not.toHaveBeenCalled()
    expect(page.text()).toContain('Нет права')
    expect(page.find('[data-test="create-person"]').exists()).toBe(false)
  })

  it('renders names, status, photo and missing-role markers', async () => {
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? { data: [] } : result([
      person({ photo_url: 'https://church.test/photo', archived: true }),
    ])))
    const page = await mountPage()
    expect(page.text()).toContain('Прокопенко Мария')
    expect(page.get('a[href="/people/01J00000000000000000000002"]').text()).toContain('Прокопенко Мария')
    expect(page.text()).toContain('Член церкви')
    expect(page.text()).toContain('без ролей')
    expect(page.text()).toContain('В архиве')
    expect(page.find('img').attributes('src')).toBe('https://church.test/photo')
    expect(page.find('[data-test="create-person"]').exists()).toBe(false)
  })

  it('debounces search for 300 ms and sends only the latest text', async () => {
    const page = await mountPage()
    vi.useFakeTimers()
    await page.get('[data-test="search"]').setValue('прок')
    await vi.advanceTimersByTimeAsync(200)
    await page.get('[data-test="search"]').setValue('прокопенк')
    await vi.advanceTimersByTimeAsync(299)
    expect(peopleCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(peopleCalls()).toHaveLength(2)
    expect(lastQuery().get('search')).toBe('прокопенк')
    await page.get('[data-test="search"]').setValue('   ')
    await vi.advanceTimersByTimeAsync(300)
    expect(lastQuery().has('search')).toBe(false)
  })

  it('passes status, ministry, archive and missing-role filters and clears them', async () => {
    const page = await mountPage()
    expect(lastQuery().has('archived')).toBe(false)
    await page.get('[data-test="filter-status"]').setValue('guest')
    await page.get('[data-test="filter-ministry"]').setValue(ministryId)
    await page.get('[data-test="filter-archived"]').setValue(true)
    await page.get('[data-test="filter-without-roles"]').setValue(true)
    expect(Object.fromEntries(lastQuery())).toMatchObject({
      status: 'guest', ministry: ministryId, archived: '1', without_roles: '1', page: '1',
    })
    await page.get('[data-test="filter-status"]').setValue('')
    await page.get('[data-test="filter-ministry"]').setValue('')
    await page.get('[data-test="filter-archived"]').setValue(false)
    await page.get('[data-test="filter-without-roles"]').setValue(false)
    expect([...lastQuery().keys()]).toEqual(['page'])
  })

  it('appends the next page, then resets pagination on filter changes', async () => {
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? { data: [] }
      : path.includes('page=2') ? result([person({ id: 'p2', full_name: 'Иванов Иван' })], 2, 2)
        : path.includes('status=guest') ? result([person({ full_name: 'Новый результат' })]) : result([person()], 1, 2)))
    const page = await mountPage()
    await page.get('[data-test="load-more"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Прокопенко Мария')
    expect(page.text()).toContain('Иванов Иван')
    expect(page.find('[data-test="load-more"]').exists()).toBe(false)
    await page.get('[data-test="filter-status"]').setValue('guest')
    await flushPromises()
    expect(lastQuery().get('page')).toBe('1')
    expect(page.text()).toContain('Новый результат')
    expect(page.text()).not.toContain('Иванов Иван')
  })

  it('ignores responses from an older filter request', async () => {
    const page = await mountPage()
    let finishOld!: (value: PeopleResponse) => void
    get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    await page.get('[data-test="filter-status"]').setValue('guest')
    get.mockResolvedValueOnce(result([person({ full_name: 'Актуальный результат' })]))
    await page.get('[data-test="filter-status"]').setValue('attendee')
    await flushPromises()
    finishOld(result([person({ full_name: 'Устаревший результат' })]))
    await flushPromises()
    expect(page.text()).toContain('Актуальный результат')
    expect(page.text()).not.toContain('Устаревший результат')
  })

  it('shows an error with retry and then a genuine empty state', async () => {
    get.mockImplementation((path: string) => path === '/ministries' ? Promise.resolve({ data: [] }) : Promise.reject(new Error('offline')))
    const page = await mountPage()
    expect(page.find('[role="alert"]').exists()).toBe(true)
    expect(page.text()).not.toContain('Люди не найдены')
    get.mockResolvedValueOnce(result([]))
    await page.get('[data-test="retry"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Люди не найдены')
  })

  it('retains loaded people and retries the failed next page', async () => {
    get.mockImplementation((path: string) => Promise.resolve(path === '/ministries' ? { data: [] } : result([person()], 1, 2)))
    const page = await mountPage()
    get.mockRejectedValueOnce(new Error('offline'))
    await page.get('[data-test="load-more"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Прокопенко Мария')
    get.mockResolvedValueOnce(result([person({ id: 'p2', full_name: 'Вторая страница' })], 2, 2))
    await page.get('[data-test="retry"]').trigger('click')
    await flushPromises()
    expect(lastQuery().get('page')).toBe('2')
    expect(page.text()).toContain('Вторая страница')
    expect(page.findAll('[data-test="person-item"]')).toHaveLength(2)
  })

  it('still shows people if the ministry filter cannot load', async () => {
    get.mockImplementation((path: string) => path === '/ministries' ? Promise.reject(new Error('offline')) : Promise.resolve(result()))
    const page = await mountPage()
    expect(page.text()).toContain('Прокопенко Мария')
    expect(page.text()).toContain('Не удалось загрузить служения')
  })

  it('clears visible people when permissions are revoked during the session', async () => {
    const page = await mountPage()
    permit()
    await flushPromises()
    expect(page.text()).not.toContain('Прокопенко Мария')
    expect(page.text()).toContain('Нет права')
  })
})

async function openForm() {
  permit('people.view', 'people.manage')
  const page = await mountPage()
  await page.get('[data-test="create-person"]').trigger('click')
  await page.get('[name="last_name"]').setValue('Иванова')
  await page.get('[name="first_name"]').setValue('Анна')
  return page
}

describe('person creation', () => {
  it('submits all person fields, normalizes blank optionals and refreshes the list', async () => {
    const page = await openForm()
    await page.get('[name="patronymic"]').setValue(' Петровна ')
    await page.get('[name="phone"]').setValue('+79123456789')
    await page.get('[name="email"]').setValue('anna@example.com')
    await page.get('[name="birth_date"]').setValue('1990-03-15')
    await page.get('[name="status"]').setValue('attendee')
    get.mockResolvedValueOnce(result([person({ full_name: 'Иванова Анна' })]))
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people', {
      last_name: 'Иванова', first_name: 'Анна', patronymic: 'Петровна', phone: '+79123456789',
      email: 'anna@example.com', birth_date: '1990-03-15', status: 'attendee',
    })
    expect(page.find('form').exists()).toBe(false)
    expect(page.text()).toContain('Человек создан')
    expect(page.text()).toContain('Иванова Анна')
  })

  it('sends null for empty optional fields without changing contact visibility', async () => {
    const page = await openForm()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/people', {
      last_name: 'Иванова', first_name: 'Анна', patronymic: null, phone: null, email: null,
      birth_date: null, status: 'guest',
    })
  })

  it('shows a note field only with people.view_notes and submits it when present', async () => {
    const page = await openForm()
    expect(page.find('[name="note"]').exists()).toBe(false)
    permit('people.view', 'people.manage', 'people.view_notes')
    await flushPromises()
    await page.get('[name="note"]').setValue('Заметка')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(post.mock.calls[0]![1].note).toBe('Заметка')
  })

  it.each([
    ['person.duplicate_phone', 'Человек с таким телефоном уже есть.'],
    ['person.duplicate_email', 'Человек с такой почтой уже есть.'],
  ])('keeps the successful creation and warning visible for %s', async (code, message) => {
    const page = await openForm()
    post.mockResolvedValueOnce({ data: person(), warnings: [{ code, message }] })
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.text()).toContain('Человек создан')
    expect(page.get('[data-test="warnings"]').text()).toContain(message)
    expect(page.find('form').exists()).toBe(false)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('preserves values after validation failure and allows correction', async () => {
    const page = await openForm()
    post.mockRejectedValueOnce({ statusCode: 422, data: { message: 'Ошибка проверки.', errors: { phone: ['Неверный телефон.'] } } })
    await page.get('[name="phone"]').setValue('wrong')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.text()).toContain('Неверный телефон.')
    expect((page.get('[name="first_name"]').element as HTMLInputElement).value).toBe('Анна')
    await page.get('[name="phone"]').setValue('+79123456789')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(page.text()).toContain('Человек создан')
  })

  it('does not send blank names and prevents duplicate submissions', async () => {
    const page = await openForm()
    await page.get('[name="first_name"]').setValue('  ')
    await page.get('form').trigger('submit')
    expect(post).not.toHaveBeenCalled()
    await page.get('[name="first_name"]').setValue('Анна')
    let complete!: (value: unknown) => void
    post.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await page.get('form').trigger('submit')
    await page.get('form').trigger('submit')
    expect(post).toHaveBeenCalledTimes(1)
    expect(page.get('[data-test="save-person"]').attributes('disabled')).toBeDefined()
    complete({ data: person(), warnings: [] })
    await flushPromises()
  })

  it('hides an open form when people.manage is revoked', async () => {
    const page = await openForm()
    permit('people.view')
    await flushPromises()
    expect(page.find('form').exists()).toBe(false)
    expect(page.find('[data-test="create-person"]').exists()).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('cancels creation without sending a request', async () => {
    const page = await openForm()
    await page.get('[data-test="cancel-person"]').trigger('click')
    expect(page.find('form').exists()).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('directory redesign boundaries', () => {
  it('makes the whole compact row an accessible person link', async () => {
    const page = await mountPage()
    const row = page.get('[data-test="person-item"]')
    const link = row.get('a')
    expect(link.classes()).toContain('person-item__open')
    expect(link.text()).toContain('Член церкви')
    expect(link.findAll('img, .person-item__placeholder')).toHaveLength(1)
  })
  it('rejects an old list response across synchronous revoke and restore', async () => {
    const page = await mountPage()
    let finish!: (value: PeopleResponse) => void
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await page.get('[data-test="filter-status"]').setValue('guest')
    permit(); permit('people.view'); await flushPromises()
    finish(result([person({ full_name: 'Запоздавшее имя' })])); await flushPromises()
    expect(page.text()).not.toContain('Запоздавшее имя')
  })
  it('preserves id-only creation confirmation when canonical list read fails', async () => {
    const page = await openForm()
    post.mockResolvedValueOnce({ data: { id: 'created-id' }, warnings: [] })
    get.mockRejectedValueOnce({ statusCode: 503 })
    await page.get('form').trigger('submit'); await flushPromises()
    expect(page.text()).toContain('Человек создан')
    expect(page.find('form').exists()).toBe(false)
    await page.get('[data-test="retry"]').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledTimes(1)
  })
})
describe('directory filter session scope', () => {
  it('clears prior filters and search before reading for a new session of the same account', async () => {
    const page = await mountPage()
    await page.get('[data-test="filter-status"]').setValue('guest')
    await page.get('[data-test="filter-ministry"]').setValue(ministryId)
    await page.get('[data-test="filter-archived"]').setValue(true)
    await page.get('[data-test="filter-without-roles"]').setValue(true)
    await page.get('[data-test="search"]').setValue('Старое имя')
    useAuthStore(testPinia).sessionVersion++
    await flushPromises()
    expect((page.get('[data-test="search"]').element as HTMLInputElement).value).toBe('')
    expect((page.get('[data-test="filter-status"]').element as HTMLSelectElement).value).toBe('')
    expect((page.get('[data-test="filter-ministry"]').element as HTMLSelectElement).value).toBe('')
    expect((page.get('[data-test="filter-archived"]').element as HTMLInputElement).checked).toBe(false)
    expect((page.get('[data-test="filter-without-roles"]').element as HTMLInputElement).checked).toBe(false)
    expect([...lastQuery().keys()]).toEqual(['page'])
  })
  it('preserves filters and search on unrelated rights refresh in the same session', async () => {
    const page = await mountPage()
    await page.get('[data-test="filter-status"]').setValue('guest')
    await page.get('[data-test="search"]').setValue('Мария')
    permit('people.view', 'audit.view'); await flushPromises()
    expect((page.get('[data-test="search"]').element as HTMLInputElement).value).toBe('Мария')
    expect((page.get('[data-test="filter-status"]').element as HTMLSelectElement).value).toBe('guest')
  })
})
