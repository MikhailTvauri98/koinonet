// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminRoles from '~/pages/admin/roles.vue'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

const catalogue = [
  { key: 'people.view', scope: 'global', label: 'Видеть справочник', description: '...' },
  { key: 'roles.manage_global', scope: 'global', label: 'Управлять глобальными ролями', description: '...' },
]
const roles = [
  { id: 'r0', name: 'Администратор', scope: 'global', ministry_id: null, description: null, is_system: true, permissions: [] },
  { id: 'r1', name: 'Пастор', scope: 'global', ministry_id: null, description: null, is_system: false, permissions: ['people.view'] },
]

beforeEach(() => {
  [get, post, del].forEach(fn => fn.mockReset())
  permissions.global = []
  get.mockImplementation((path: string) => Promise.resolve(
    path.startsWith('/permissions') ? { data: catalogue } : { data: roles },
  ))
})

describe('admin global roles page', () => {
  it('hides the editor without roles.manage_global', async () => {
    const page = await mountSuspended(AdminRoles)

    expect(page.text()).toContain('Нет права')
    expect(page.find('[data-test="create-role"]').exists()).toBe(false)
  })

  it('lists global roles and opens the editor for a selected one with roles.manage_global', async () => {
    permissions.global = ['roles.manage_global']

    const page = await mountSuspended(AdminRoles)
    await flushPromises()

    expect(page.text()).toContain('Пастор')
    expect(page.find('[data-test="role-name"]').exists()).toBe(false)

    await page.find('[data-test="select-role-r1"]').trigger('click')
    await flushPromises()

    expect((page.get('[data-test="role-name"]').element as HTMLInputElement).value).toBe('Пастор')
  })

  it('creates a global role from the create button and adds it to the list', async () => {
    permissions.global = ['roles.manage_global']
    post.mockResolvedValue({ data: { id: 'r2', name: 'Диакон', is_system: false, permissions: [] } })

    const page = await mountSuspended(AdminRoles)
    await flushPromises()
    await page.find('[data-test="create-role"]').trigger('click')
    await flushPromises()
    await page.find('[data-test="role-name"]').setValue('Диакон')
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/roles', { scope: 'global', name: 'Диакон', description: null, permissions: [] })
    expect(page.text()).toContain('Диакон')
  })

  // Инвариант 6.3.1: интерфейс не должен предлагать снять права или удалить
  // системную роль, даже держателю roles.manage_global.
  it('does not offer to edit permissions or delete the system role', async () => {
    permissions.global = ['roles.manage_global']

    const page = await mountSuspended(AdminRoles)
    await flushPromises()
    await page.find('[data-test="select-role-r0"]').trigger('click')
    await flushPromises()

    expect(page.find('[data-test="role-name"]').attributes('disabled')).toBeDefined()
    expect(page.find('[data-test="delete-role"]').exists()).toBe(false)
    expect(page.find('[data-test="save-role"]').exists()).toBe(false)
  })
})
