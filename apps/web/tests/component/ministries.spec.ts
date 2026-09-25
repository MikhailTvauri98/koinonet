// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembersTab from '~/pages/ministries/[id]/members.vue'
import MinistryCard from '~/pages/ministries/[id]/index.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()
// Дефект плана: `global: []` без аннотации типа выводится как `never[]`,
// и позднейшее `permissions.global = ['ministries.create']` не проходит
// typecheck — та же природа, что у `ministries: {} as Record<...>` рядом,
// только про него в брифе не забыли.
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, put, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'm1' } }))

beforeEach(() => {
  [get, post, put, del].forEach(fn => fn.mockReset())
  permissions.ministries = {}
})

const ministry = { id: 'm1', name: 'Прославление', description: null, cover_url: null, default_role_id: 'r-member' }
const member = {
  id: 'mem1', person: { id: 'p1', full_name: 'Прокопенко Мария' },
  roles: [{ id: 'r-member', name: 'Участник' }],
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
    get.mockResolvedValue({ data: [member] })
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
})
