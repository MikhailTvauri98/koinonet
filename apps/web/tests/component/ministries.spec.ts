// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MembersTab from '~/pages/ministries/[id]/members.vue'
import MinistryCard from '~/pages/ministries/[id]/index.vue'
import RolesTab from '~/pages/ministries/[id]/roles.vue'
import MinistriesList from '~/pages/ministries/index.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import type { Member, Ministry } from '~/utils/ministries'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()
// Реактивен (как в person-card.spec.ts), а не литерал брифа: тест на смену
// служения посреди сессии (review round 2) должен суметь поменять
// route.params.id у уже смонтированного компонента.
const route = reactive({ params: { id: 'm1' } })

mockNuxtImport('useApi', () => () => ({ get, post, put, patch, delete: del }))
mockNuxtImport('useRoute', () => () => route)

// Смонтированный экран прошлого теста живёт дальше и реагирует на права,
// которые следующий тест пишет в тот же стор, — поэтому экраны снимаются
// после каждого теста.
enableAutoUnmount(afterEach)

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  [get, post, put, patch, del].forEach(fn => fn.mockReset())
  grantPermissions()
  route.params.id = 'm1'
})

// Тестовые данные — по типам ресурсов из схемы: `MemberResource` плоский,
// имя и фото лежат в самой строке участника, а не во вложенном `person`.
const ministry: Ministry = {
  id: 'm1', name: 'Прославление', description: null, cover_url: null, default_role_id: 'r-member', chat_id: null, archived_at: null,
}
const member: Member = {
  id: 'mem1', ministry_id: 'm1', person_id: 'p1', full_name: 'Прокопенко Мария', joined_at: '2026-09-01T10:00:00Z',
  photo_url: null, roles: [{ id: 'r-member', name: 'Участник' }],
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

  // Кандидатов для добавления ищет `GET /people`, а он требует people.view:
  // без справочника кнопка вела бы в поиск, который всегда отказывает.
  it('offers adding a member with members.manage in that ministry and people.view', async () => {
    grantPermissions({ global: ['people.view'], ministries: { m1: ['members.manage'] } })
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.find('[data-test="add-member"]').exists()).toBe(true)
  })

  it('does not offer adding a member without people.view, but keeps the row actions', async () => {
    grantPermissions({ ministries: { m1: ['members.manage'] } })
    mockMembersAndRoles([member])

    const page = await mountSuspended(MembersTab)
    await flushPromises()

    expect(page.find('[data-test="add-member"]').exists()).toBe(false)
    expect(page.find('[data-test="remove-member"]').exists()).toBe(true)
    expect(page.find('[data-test="save-roles"]').exists()).toBe(true)
  })

  it('hides member actions when members.manage is withdrawn mid-session', async () => {
    grantPermissions({ global: ['people.view'], ministries: { m1: ['members.manage'] } })
    mockMembersAndRoles([member])

    const page = await mountSuspended(MembersTab)
    await flushPromises()
    expect(page.find('[data-test="add-member"]').exists()).toBe(true)

    grantPermissions({ global: ['people.view'], ministries: {} })
    await flushPromises()

    expect(page.find('[data-test="add-member"]').exists()).toBe(false)
    expect(page.find('[data-test="remove-member"]').exists()).toBe(false)
  })

  it('shows the default role on a freshly added member', async () => {
    grantPermissions({ global: ['people.view'], ministries: { m1: ['members.manage'] } })
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
    grantPermissions({ ministries: { m1: ['members.manage'] } })
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
    grantPermissions({ ministries: { m1: ['members.manage'] } })
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

  // Review round 2 (task 28, critical): full_name следует тому же правилу
  // видимости, что и photo_url (people.view или сам человек) — участник без
  // этого права видит строку состава, но не имя коллеги. Нейтральная
  // надпись вместо пустой строки.
  it('shows a neutral label for a member without a visible name', async () => {
    mockMembersAndRoles([{ ...member, full_name: null }])

    const page = await mountSuspended(MembersTab)

    expect(page.text()).toContain('Имя скрыто')
  })

  // Review round 2 (task 28, important): Nuxt переиспользует компонент
  // страницы между служениями — открытый диалог добавления не должен
  // пережить смену route.params.id, иначе найденный в старом служении
  // человек добавится уже в новое.
  it('closes the add dialog when the ministry changes, so a stale search result cannot be added to the new one', async () => {
    grantPermissions({ global: ['people.view'], ministries: { m1: ['members.manage'], m2: ['members.manage'] } })
    get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith('/roles') ? { data: [] }
        : path.startsWith('/people') ? { data: [{ id: 'p1', full_name: 'Прокопенко Мария' }] }
          : { data: [] },
    ))

    const page = await mountSuspended(MembersTab)
    await page.find('[data-test="add-member"]').trigger('click')
    await page.find('[data-test="member-search"]').setValue('Прокопенко')
    await flushPromises()
    expect(page.find('[data-test="person-option-p1"]').exists()).toBe(true)

    route.params.id = 'm2'
    await flushPromises()

    expect(page.find('[data-test="member-search"]').exists()).toBe(false)
    expect(page.find('[data-test="person-option-p1"]').exists()).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ministry tabs', () => {
  // Вкладка «Роли» — только тем, кому есть что на ней делать: список ролей
  // читают носители roles.manage и members.manage в этом служении
  // (docs/architecture.md, 6.1).
  it('hides the roles tab from someone who manages neither roles nor members in that ministry', async () => {
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)
    const tabs = page.get('nav[aria-label="Разделы служения"]')

    expect(tabs.find('a[href="/ministries/m1"]').exists()).toBe(true)
    expect(tabs.find('a[href="/ministries/m1/members"]').exists()).toBe(true)
    expect(tabs.find('a[href="/ministries/m1/roles"]').exists()).toBe(false)
  })

  it.each(['roles.manage', 'members.manage'])('shows the roles tab with %s in that ministry', async (key) => {
    grantPermissions({ ministries: { m1: [key] } })
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.get('nav[aria-label="Разделы служения"]').find('a[href="/ministries/m1/roles"]').exists()).toBe(true)
  })

  it('hides the roles tab again when the right is withdrawn mid-session', async () => {
    grantPermissions({ ministries: { m1: ['roles.manage'] } })
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)
    grantPermissions({ ministries: { m1: [] } })
    await flushPromises()

    expect(page.find('a[href="/ministries/m1/roles"]').exists()).toBe(false)
  })
})

describe('ministry card', () => {
  it('says the ministry is gone instead of the server text, which names the model class', async () => {
    get.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 404, data: { message: 'No query results for model [App\\Modules\\Ministries\\Models\\Ministry] m1' },
    }))

    const page = await mountSuspended(MinistryCard)

    expect(page.text()).toContain('Запись не найдена — возможно, её удалили.')
    expect(page.text()).not.toContain('App\\Modules')
  })

  it('hides the cover uploader without ministry.edit', async () => {
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)

    expect(page.findComponent(MediaUploader).exists()).toBe(false)
    expect(page.text()).not.toContain('Изменить обложку')
  })

  // Обложка идёт через тот же загрузчик, что и фото: привязать можно только
  // обработанный файл (иначе сервер отвечает media.not_ready).
  it('sets the cover only after the file is processed, then shows the new cover', async () => {
    grantPermissions({ ministries: { m1: ['ministry.edit'] } })
    get.mockImplementation((path: string) => Promise.resolve(path === '/media/md1/status'
      ? { data: { id: 'md1', kind: 'image', status: 'ready', url: '/media/md1', thumb_url: null } }
      : { data: ministry }))
    post.mockResolvedValue({ data: { id: 'md1', kind: 'image', status: 'processing', url: '/media/md1', thumb_url: null } })
    put.mockResolvedValue({ data: { ...ministry, cover_url: 'https://church.test/cover.webp' } })

    const page = await mountSuspended(MinistryCard)
    const uploader = page.findComponent(MediaUploader)
    expect(uploader.text()).toContain('Изменить обложку')
    vi.useFakeTimers()
    await (uploader.vm as unknown as { upload: (file: File) => Promise<void> }).upload(new File(['bytes'], 'cover.jpg', { type: 'image/jpeg' }))

    expect(post).toHaveBeenCalledWith('/media', expect.any(FormData))
    expect(put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)

    expect(put).toHaveBeenCalledWith('/ministries/m1/cover', { media_id: 'md1' })
    expect(page.get('[data-test="ministry-cover"]').attributes('src')).toBe('https://church.test/cover.webp')
  })

  it('does not offer to change the cover of an archived ministry', async () => {
    grantPermissions({ ministries: { m1: ['ministry.edit'] } })
    get.mockResolvedValue({ data: { ...ministry, archived_at: '2026-09-01T10:00:00Z' } })

    const page = await mountSuspended(MinistryCard)

    expect(page.get('[data-test="file-input"]').attributes('disabled')).toBeDefined()
  })

  it('asks for confirmation before archiving', async () => {
    grantPermissions({ global: ['ministries.create'] })
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
    grantPermissions({ ministries: { m1: ['ministry.edit'] } })
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

describe('ministry roles tab', () => {
  const roleMember = { id: 'r-member', name: 'Участник', scope: 'ministry', ministry_id: 'm1', description: null, is_system: false, permissions: [] as string[] }
  const roleTech = { id: 'r-tech', name: 'Звукорежиссёр', scope: 'ministry', ministry_id: 'm1', description: null, is_system: false, permissions: ['events.manage'] }
  const permissionCatalogue = [
    { key: 'members.manage', scope: 'ministry', label: 'Управлять составом', description: '...' },
    { key: 'events.manage', scope: 'ministry', label: 'Управлять событиями служения', description: '...' },
  ]

  // Три разных GET за один экран (ministries/[id]/roles.vue грузит служение
  // и каталог ролей, RoleEditor поверх — общий каталог прав) — различаем по
  // пути, тем же приёмом, что и mockMembersAndRoles выше в этом файле.
  function mockMinistryAndRoles(defaultRoleId = 'r-member', roles = [roleMember, roleTech]) {
    get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith('/roles') ? { data: roles }
        : path.startsWith('/permissions') ? { data: permissionCatalogue }
          : { data: { ...ministry, default_role_id: defaultRoleId } },
    ))
  }

  it('shows a read-only list without roles.manage in that ministry', async () => {
    grantPermissions({ ministries: { m1: ['members.manage'] } })
    mockMinistryAndRoles()

    const page = await mountSuspended(RolesTab)
    await flushPromises()

    expect(page.text()).toContain('Звукорежиссёр')
    expect(page.find('[data-test="create-role"]').exists()).toBe(false)
    expect(page.find('[data-test="select-role-r-tech"]').exists()).toBe(false)
  })

  it('creates a ministry role with roles.manage in that ministry', async () => {
    grantPermissions({ ministries: { m1: ['roles.manage'] } })
    mockMinistryAndRoles()
    post.mockResolvedValue({ data: { id: 'r-new', name: 'Диакон', is_system: false, permissions: [] } })

    const page = await mountSuspended(RolesTab)
    await flushPromises()
    await page.find('[data-test="create-role"]').trigger('click')
    await flushPromises()
    await page.find('[data-test="role-name"]').setValue('Диакон')
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/ministries/m1/roles', { name: 'Диакон', description: null, permissions: [] })
    expect(page.text()).toContain('Диакон')
  })

  // Выбор роли по умолчанию (брифа задачи 29): переключатель на вкладке
  // ролей шлёт PATCH /ministries/m1 с default_role_id, а не отдельный
  // эндпоинт ролей — тот же PATCH, что и у названия/описания служения
  // (docs/architecture.md 6.1, 6.3.4).
  it('sets a new default role from the roles tab', async () => {
    grantPermissions({ ministries: { m1: ['roles.manage'] } })
    mockMinistryAndRoles('r-member')
    patch.mockResolvedValue({ data: { ...ministry, default_role_id: 'r-tech' } })

    const page = await mountSuspended(RolesTab)
    await flushPromises()
    await page.find('[data-test="set-default-r-tech"]').trigger('click')
    await flushPromises()

    expect(patch).toHaveBeenCalledWith('/ministries/m1', { default_role_id: 'r-tech' })
    expect(page.text()).toContain('по умолчанию')
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

    grantPermissions({ global: ['ministries.create'] })
    const withRight = await mountSuspended(MinistriesList)
    expect(withRight.find('[data-test="create-ministry"]').exists()).toBe(true)
  })

  // Создатель не становится участником (docs/architecture.md, 7.3), а без
  // ministries.view_all сервер не отдаёт ему созданное служение. Экран
  // говорит это прямо, а не молча оставляет список без нового служения.
  it('explains when the created ministry is not visible to its creator', async () => {
    grantPermissions({ global: ['ministries.create'] })
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({ data: { id: 'm3', name: 'Молодёжное', description: null, cover_url: null, default_role_id: 'r3', archived_at: null } })

    const page = await mountSuspended(MinistriesList)
    await page.find('[data-test="create-ministry"]').trigger('click')
    await page.find('[data-test="ministry-name"]').setValue('Молодёжное')
    await page.find('form').trigger('submit')
    await flushPromises()

    const notice = page.get('[data-test="created-hidden"]')
    expect(notice.text()).toContain('Служение «Молодёжное» создано')
    expect(notice.text()).toContain('Видеть все служения')
  })

  it('creates a ministry and refreshes the list', async () => {
    grantPermissions({ global: ['ministries.create'] })
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
