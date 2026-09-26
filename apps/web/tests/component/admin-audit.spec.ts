// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAudit from '~/pages/admin/audit.vue'

const get = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    action: 'person.archived',
    actor: { id: 'u1', person_id: 'p1', name: 'Прокопенко Мария' },
    subject_type: 'person',
    subject_id: 'p2',
    payload: null,
    ip: '10.0.0.1',
    created_at: '2026-09-12T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  get.mockReset()
  permissions.global = []
  // Часовой пояс церкви (`GET /settings`) — отдельный запрос от `GET /audit`;
  // различаем по началу пути, как ministries.spec.ts различает состав и
  // каталог ролей за одним замоканным `get`.
  get.mockImplementation((path: string) => Promise.resolve(
    path.startsWith('/settings')
      ? { data: { church_name: 'Дом хлеба', timezone: 'Europe/Moscow' } }
      : { data: [entry()], next_cursor: null },
  ))
})

describe('admin audit page', () => {
  it('hides the journal without audit.view', async () => {
    const page = await mountSuspended(AdminAudit)

    expect(page.text()).toContain('Нет права')
    expect(get).not.toHaveBeenCalled()
  })

  it('shows entries with audit.view', async () => {
    permissions.global = ['audit.view']

    const page = await mountSuspended(AdminAudit)
    await flushPromises()

    expect(page.text()).toContain('person.archived')
    expect(page.text()).toContain('Прокопенко Мария')
  })

  it('loads the next page with the cursor from next_cursor', async () => {
    permissions.global = ['audit.view']
    get.mockImplementation((path: string) => {
      if (path.startsWith('/settings')) return Promise.resolve({ data: { church_name: 'Дом хлеба', timezone: 'Europe/Moscow' } })
      if (path.includes('cursor=next-page')) return Promise.resolve({ data: [entry({ id: 'a2', action: 'role.created' })], next_cursor: null })
      return Promise.resolve({ data: [entry()], next_cursor: 'next-page' })
    })

    const page = await mountSuspended(AdminAudit)
    await flushPromises()

    expect(page.find('[data-test="load-more"]').exists()).toBe(true)
    await page.find('[data-test="load-more"]').trigger('click')
    await flushPromises()

    const auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    expect(auditCalls[1]).toContain('cursor=next-page')
    expect(page.text()).toContain('role.created')
    // Обе страницы остаются на экране, а не подменяют друг друга.
    expect(page.text()).toContain('person.archived')
    expect(page.find('[data-test="load-more"]').exists()).toBe(false)
  })

  it('filters by action', async () => {
    permissions.global = ['audit.view']

    const page = await mountSuspended(AdminAudit)
    await flushPromises()
    get.mockClear()
    await page.find('[data-test="filter-action"]').setValue('role.created')
    await new Promise(resolve => setTimeout(resolve, 350))
    await flushPromises()

    const auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    expect(auditCalls.at(-1)).toContain('action=role.created')
  })

  it('sets the actor filter by clicking the actor in a row and can clear it', async () => {
    permissions.global = ['audit.view']

    const page = await mountSuspended(AdminAudit)
    await flushPromises()
    get.mockClear()
    await page.find('[data-test="entry-actor-a1"]').trigger('click')
    await flushPromises()

    let auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    expect(auditCalls.at(-1)).toContain('actor=u1')
    expect(page.find('[data-test="actor-chip"]').text()).toContain('Прокопенко Мария')

    get.mockClear()
    await page.find('[data-test="clear-actor"]').trigger('click')
    await flushPromises()

    auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    expect(auditCalls.at(-1)).not.toContain('actor=')
    expect(page.find('[data-test="actor-chip"]').exists()).toBe(false)
  })

  it('sets the subject filter by clicking the subject in a row', async () => {
    permissions.global = ['audit.view']

    const page = await mountSuspended(AdminAudit)
    await flushPromises()
    get.mockClear()
    await page.find('[data-test="entry-subject-a1"]').trigger('click')
    await flushPromises()

    const auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    expect(auditCalls.at(-1)).toContain('subject_type=person')
    expect(auditCalls.at(-1)).toContain('subject_id=p2')
    expect(page.find('[data-test="subject-chip"]').text()).toContain('person p2')
  })

  it('converts the period filter to church-timezone day boundaries, not the machine one', async () => {
    permissions.global = ['audit.view']

    const page = await mountSuspended(AdminAudit)
    await flushPromises()
    get.mockClear()
    await page.find('[data-test="filter-from"]').setValue('2026-09-12')
    await page.find('[data-test="filter-to"]').setValue('2026-09-12')
    await flushPromises()

    const auditCalls = get.mock.calls.map(call => call[0] as string).filter(path => path.startsWith('/audit'))
    const last = auditCalls.at(-1) ?? ''
    // Europe/Moscow — UTC+3: местная полночь 12 сентября — 21:00 UTC 11-го.
    expect(decodeURIComponent(last)).toContain('from=2026-09-11T21:00:00.000Z')
    expect(decodeURIComponent(last)).toContain('to=2026-09-12T20:59:59.999Z')
  })

  it('ignores a stale response after the filter changed again before it resolved', async () => {
    permissions.global = ['audit.view']
    const page = await mountSuspended(AdminAudit)
    await flushPromises()

    let finishStale!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise((resolve) => { finishStale = resolve }))
    await page.find('[data-test="filter-action"]').setValue('slow.filter')
    await new Promise(resolve => setTimeout(resolve, 350))
    await flushPromises()
    // Первый запрос (по «slow.filter») теперь висит; следующий фильтр уходит
    // новым запросом, который разрешается сразу же обычным моком.
    await page.find('[data-test="filter-action"]').setValue('fresh.filter')
    await new Promise(resolve => setTimeout(resolve, 350))
    await flushPromises()

    // Запоздавший ответ первого запроса приходит последним — он не должен
    // ни дописаться к свежему списку, ни воскресить курсор.
    finishStale({ data: [entry({ id: 'stale', action: 'stale.filter.result' })], next_cursor: 'stale-cursor' })
    await flushPromises()

    expect(page.text()).not.toContain('stale.filter.result')
    expect(page.find('[data-test="load-more"]').exists()).toBe(false)
  })
})
