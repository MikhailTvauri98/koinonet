// @vitest-environment nuxt
// Дефект плана (брифа задачи 29): исходный текст без этой прагмы падает не
// на утверждениях, а раньше — `mountSuspended`/`mockNuxtImport` рассчитаны на
// окружение `nuxt` (vitest.config.ts задаёт `happy-dom` по умолчанию для
// остального проекта), остальные *.spec.ts с этими же импортами начинаются
// с неё же (tests/component/people.spec.ts, person-card.spec.ts).
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Дефект плана: `~/app/components/roles/RoleEditor.vue` не существует в
// Nuxt 4 — `~` уже указывает на `app/` (docs/architecture.md, раздел 10;
// nuxt.config.ts), правильный путь без второго `app/`.
import RoleEditor from '~/components/roles/RoleEditor.vue'

enableAutoUnmount(afterEach)

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
const patch = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, patch, delete: del }))

const catalogue = [
  { key: 'people.view', scope: 'global', label: 'Видеть справочник', description: '...' },
  { key: 'settings.manage', scope: 'global', label: 'Настройки церкви', description: '...' },
  { key: 'members.manage', scope: 'ministry', label: 'Управлять составом', description: '...' },
  { key: 'roles.manage', scope: 'ministry', label: 'Управлять ролями служения', description: '...' },
]

beforeEach(() => {
  [get, post, patch, del].forEach(fn => fn.mockReset())
  get.mockResolvedValue({ data: catalogue })
})

describe('role editor', () => {
  it('shows only global permissions for a global role', async () => {
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'global', role: null } })

    expect(editor.text()).toContain('Видеть справочник')
    expect(editor.text()).not.toContain('Управлять составом')
  })

  it('shows only ministry permissions for a ministry role', async () => {
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'ministry', ministryId: 'm1', role: null } })

    expect(editor.text()).toContain('Управлять составом')
    expect(editor.text()).not.toContain('Настройки церкви')
  })

  it('saves a role with no permissions at all', async () => {
    post.mockResolvedValue({ data: { id: 'r1', name: 'Вокалист', permissions: [] } })

    const editor = await mountSuspended(RoleEditor, { props: { scope: 'ministry', ministryId: 'm1', role: null } })
    await editor.find('[data-test="role-name"]').setValue('Вокалист')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/ministries/m1/roles', { name: 'Вокалист', description: null, permissions: [] })
  })

  it('marks a permissionless ministry role as a slot position', async () => {
    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'ministry', ministryId: 'm1', role: { id: 'r1', name: 'Вокалист', permissions: [] } },
    })

    expect(editor.text()).toContain('используется как позиция в слотах')
  })

  it('renders the system role read-only', async () => {
    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'global', role: { id: 'r0', name: 'Администратор', is_system: true, permissions: [] } },
    })

    expect(editor.find('[data-test="role-name"]').attributes('disabled')).toBeDefined()
    expect(editor.find('[data-test="delete-role"]').exists()).toBe(false)
    expect(editor.text()).toContain('системная')
  })

  it('shows the carriers count before deleting', async () => {
    get.mockImplementation((url: string) =>
      url.endsWith('/usage')
        ? Promise.resolve({ data: { carriers: 3, blockers: [] } })
        : Promise.resolve({ data: catalogue }))

    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'global', role: { id: 'r1', name: 'Пастор', is_system: false, permissions: [] } },
    })
    await editor.find('[data-test="delete-role"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(editor.text()).toContain('3')
    expect(del).not.toHaveBeenCalled()
  })

  it('explains a blocked deletion instead of offering to confirm', async () => {
    get.mockImplementation((url: string) =>
      url.endsWith('/usage')
        ? Promise.resolve({ data: { carriers: 1, blockers: [{ type: 'default_role', id: 'm1', title: 'Роль по умолчанию' }] } })
        : Promise.resolve({ data: catalogue }))

    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'ministry', ministryId: 'm1', role: { id: 'r1', name: 'Участник', is_system: false, permissions: [] } },
    })
    await editor.find('[data-test="delete-role"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(editor.text()).toContain('Роль по умолчанию')
    expect(editor.find('[data-test="confirm-delete"]').exists()).toBe(false)
  })
})


describe('role form groups', () => {
  it('presents role details and permissions as named sections with readable descriptions', async () => {
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'global', role: null } })
    expect(editor.findAll('.ui-form-section h2').map(h => h.text())).toEqual(['О роли', 'Права роли'])
    const permission = editor.get('[data-test="permission-people.view"]')
    expect(permission.attributes('aria-describedby')).toBeTruthy()
    expect(editor.get(`[id="${permission.attributes('aria-describedby')}"]`).text()).toBe('...')
  })

  it('uses the common dialog for deletion and exposes a close action after usage failure', async () => {
    get.mockImplementation((url: string) => url.endsWith('/usage') ? Promise.reject({ statusCode: 503 }) : Promise.resolve({ data: catalogue }))
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'global', role: { id: 'r1', name: 'Роль', permissions: [] } } })
    await editor.get('[data-test="delete-role"]').trigger('click')
    await flushPromises()
    expect(editor.find('dialog.ui-dialog').exists()).toBe(true)
    expect(editor.find('dialog [data-test="close-usage"]').exists()).toBe(true)
  })
})


it('keeps a saved role editable after the parent applies the confirmed response', async () => {
  const original = { id: 'r1', name: 'Роль', permissions: [] as string[] }
  const updated = { ...original, name: 'Новое название' }
  patch.mockResolvedValue({ data: updated })
  const editor = await mountSuspended(RoleEditor, { props: { scope: 'global', role: original } })
  await editor.get('[data-test="role-name"]').setValue(updated.name)
  await editor.get('form').trigger('submit')
  await flushPromises()
  await editor.setProps({ role: updated })
  expect(editor.get('[data-test="save-role"]').attributes('disabled')).toBeUndefined()
  expect(editor.text()).toContain('Роль сохранена.')
})
