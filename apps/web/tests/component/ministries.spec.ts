// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembersTab from '~/pages/ministries/[id]/members.vue'
import MinistryCard from '~/pages/ministries/[id]/index.vue'
import MinistriesList from '~/pages/ministries/index.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()
// Дефект плана: `global: []` без аннотации типа выводится как `never[]`,
// и позднейшее `permissions.global = ['ministries.create']` не проходит
// typecheck — та же природа, что у `ministries: {} as Record<...>` рядом,
// только про него в брифе не забыли.
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, put, patch, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'm1' } }))

beforeEach(() => {
  [get, post, put, patch, del].forEach(fn => fn.mockReset())
  permissions.global = []
  permissions.ministries = {}
})

const ministry = { id: 'm1', name: 'Прославление', description: null, cover_url: null, default_role_id: 'r-member' }
const member = {
  id: 'mem1', person: { id: 'p1', full_name: 'Прокопенко Мария' },
  roles: [{ id: 'r-member', name: 'Участник' }],
}
// Каталог ролей служения (GET /ministries/{id}/roles, доступен носителю
// members.manage — доделка задачи 28) содержит роль-по-умолчанию, которую
// уже носит `member`, — этого достаточно для проверки чекбокса `role-r-member`.
const ministryRoles = [{ id: 'r-member', name: 'Участник' }]
// `get` в брифе — один моk без разбора по пути: где реализация теперь
// делает два разных запроса (состав и каталог ролей), различаем по
// окончанию пути, а не переписываем стиль мока целиком.
function mockMembersAndRoles(members: unknown[], roles: unknown[] = ministryRoles) {
  get.mockImplementation((path: string) => Promise.resolve(
    path.endsWith('/roles') ? { data: roles } : { data: members },
  ))
}

describe('ministry members tab', () => {
  it('hides member actions without members.manage in that ministry', async () => {
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.find('[data-test="add-member"]').exists()).toBe(false)
    expect(page.find('[data-test="remove-member"]').exists()).toBe(false)
  })

  it('shows member actions with members.manage in that ministry', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.find('[data-test="add-member"]').exists()).toBe(true)
  })

  it('shows the default role on a freshly added member', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    // Дефект плана: исходный текст теста брифа кликал по
    // `person-option-p1` сразу после открытия диалога, не введя текст
    // поиска — диалог ищет по `GET /people?search=…` (см. "Фундамент" в
    // брифе задачи 28), и без текста результатов взяться неоткуда ни при
    // каком ответе `get`. Добавлены `setValue` и `flushPromises` перед
    // кликом; `get` разветвлён по пути, чтобы список участников (пустой,
    // это условие теста) не подменялся результатом поиска и наоборот.
    get.mockImplementation((path: string) => Promise.resolve(
      path.startsWith('/people') ? { data: [{ id: 'p1', full_name: 'Прокопенко Мария' }] } : { data: [] },
    ))
    post.mockResolvedValue({ data: member })

    const page = await mountSuspended(MembersTab)
    await page.find('[data-test="add-member"]').trigger('click')
    await page.find('[data-test="member-search"]').setValue('Прокопенко')
    await flushPromises()
    await page.find('[data-test="person-option-p1"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Участник')
  })

  it('shows the domain error text when the last role is removed', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    mockMembersAndRoles([member])
    put.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'member.last_role_cannot_be_removed', message: 'Нельзя снять последнюю роль.' },
    }))

    const page = await mountSuspended(MembersTab)
    await page.find('[data-test="role-r-member"]').setValue(false)
    await page.find('[data-test="save-roles"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Нельзя снять последнюю роль')
  })

  // Доделка задачи 28: GET /ministries/{id}/roles теперь открыт members.manage,
  // а не только roles.manage — чекбоксы участника берутся из полного каталога
  // ролей служения, а не из ролей уже загруженных участников. Роль, которую
  // пока никто не носит, должна быть предложена для выдачи.
  it('offers a role nobody currently holds for granting', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    mockMembersAndRoles([member], [
      { id: 'r-member', name: 'Участник' },
      { id: 'r-tech', name: 'Звукорежиссёр' },
    ])

    const page = await mountSuspended(MembersTab)
    await flushPromises()

    const checkbox = page.find('[data-test="role-r-tech"]')
    expect(checkbox.exists()).toBe(true)
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
  })
})

describe('ministry card', () => {
  it('hides the cover uploader without ministry.edit', async () => {
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)

    expect(page.find('[data-test="change-cover"]').exists()).toBe(false)
  })

  it('asks for confirmation before archiving', async () => {
    permissions.global = ['ministries.create']
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)
    await page.find('[data-test="archive"]').trigger('click')

    expect(page.find('[data-test="confirm-archive"]').exists()).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })

  // Доделка задачи 28 (второе сомнение): новый код правки названия/описания
  // остался без теста — контроллер попросил закрыть это.
  it('hides editing the name and description without ministry.edit in that ministry', async () => {
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)

    expect(page.find('[data-test="edit-ministry"]').exists()).toBe(false)
  })

  it('edits the name and description with ministry.edit in that ministry', async () => {
    permissions.ministries = { m1: ['ministry.edit'] }
    get.mockResolvedValue({ data: ministry })
    patch.mockResolvedValue({ data: { ...ministry, name: 'Прославление и музыка', description: 'Хвала Богу музыкой' } })

    const page = await mountSuspended(MinistryCard)
    await page.find('[data-test="edit-ministry"]').trigger('click')
    await page.find('[name="name"]').setValue('Прославление и музыка')
    await page.find('[name="description"]').setValue('Хвала Богу музыкой')
    // Клик по кнопке submit не всегда транслируется в событие submit формы в
    // happy-dom (см. похожую находку у MemberRow.vue в основном отчёте) —
    // триггерим саму форму, как в person-card.spec.ts.
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(patch).toHaveBeenCalledWith('/ministries/m1', { name: 'Прославление и музыка', description: 'Хвала Богу музыкой' })
    expect(page.text()).toContain('Прославление и музыка')
  })
})

describe('ministries list', () => {
  it('shows available ministries with their covers', async () => {
    get.mockResolvedValue({
      data: [
        { id: 'm1', name: 'Прославление', description: 'Хвала и музыка', cover_url: 'https://church.test/cover.jpg', default_role_id: 'r-member' },
        { id: 'm2', name: 'Дети', description: null, cover_url: null, default_role_id: 'r-kids' },
      ],
    })

    const page = await mountSuspended(MinistriesList)

    expect(page.get('a[href="/ministries/m1"]').text()).toContain('Прославление')
    expect(page.get('a[href="/ministries/m2"]').text()).toContain('Дети')
    expect(page.get('img').attributes('src')).toBe('https://church.test/cover.jpg')
  })

  it('shows the create button only with ministries.create', async () => {
    get.mockResolvedValue({ data: [] })
    const withoutRight = await mountSuspended(MinistriesList)
    expect(withoutRight.find('[data-test="create-ministry"]').exists()).toBe(false)

    permissions.global = ['ministries.create']
    const withRight = await mountSuspended(MinistriesList)
    expect(withRight.find('[data-test="create-ministry"]').exists()).toBe(true)
  })

  it('creates a ministry and refreshes the list', async () => {
    permissions.global = ['ministries.create']
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({ data: { id: 'm3', name: 'Молодёжное', description: null, cover_url: null, default_role_id: 'r3' } })

    const page = await mountSuspended(MinistriesList)
    await page.find('[data-test="create-ministry"]').trigger('click')
    await page.find('[data-test="ministry-name"]').setValue('Молодёжное')
    get.mockResolvedValue({ data: [{ id: 'm3', name: 'Молодёжное', description: null, cover_url: null, default_role_id: 'r3' }] })
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/ministries', { name: 'Молодёжное', description: null })
    expect(page.text()).toContain('Молодёжное')
  })
})
