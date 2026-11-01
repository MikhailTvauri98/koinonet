import { fileURLToPath } from 'node:url'
import type { Page, Request } from '@playwright/test'
import type { components, operations } from '../../../types/api'

type Schema<K extends keyof components['schemas']> = components['schemas'][K]
type Success<K extends keyof operations> = operations[K] extends {
  responses: { 200: { content: { 'application/json': infer Body } } }
} ? Body : never
type Reply = { status?: number, json?: unknown }
type Handler = (request: Request) => Reply | Promise<Reply>

const now = '2026-11-01T08:00:00Z'
export const longFileName = 'ПланПодготовкиВоскресногоСобытия'.repeat(4) + '.txt'
export const mediaUrl = (name: string) => '/__acceptance_media/' + encodeURIComponent(name)
export const mediaFiles = {
  square: { name: 'photo-square.jpg', width: 500, height: 500 },
  portrait: { name: 'photo-portrait.jpg', width: 500, height: 637 },
  landscape: { name: 'photo-landscape.jpg', width: 960, height: 612 },
} as const

function paginated<T>(data: T[]) {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1, from: data.length ? 1 : null, last_page: 1,
      links: [], path: null, per_page: 200, to: data.length || null, total: data.length,
    },
  }
}

function createData(long: boolean) {
  const ministry: Schema<'MinistryResource'> = {
    id: 'm1', name: long ? 'Служение'.repeat(12) + 'Хоры' : 'Музыкальное служение',
    description: 'Вместе готовимся к событиям церкви и репетициям.',
    cover_url: mediaUrl('photo-landscape.jpg'), default_role_id: 'rm1', chat_id: 'c1', archived_at: null,
  }
  const person: Schema<'PersonResource'> = {
    id: 'p1', first_name: 'Анна', last_name: 'Петрова-Константинопольская', patronymic: 'Сергеевна',
    full_name: 'Петрова-Константинопольская Анна Сергеевна', status: 'member', archived: false,
    photo_url: mediaUrl('photo-square.jpg'), has_account: true, user_id: 'u1', has_global_roles: true, account_disabled: false,
    global_roles: [{ id: 'r1', name: 'Координатор' }], ministries: [{ id: ministry.id, name: ministry.name }],
    contacts: { phone: '+79991234567', email: 'anna@example.test', birth_date: '1990-04-12' },
    note: 'Помогает в подготовке событий. Подробности доступны по текущим правам.',
  }
  const profile: Schema<'MyProfileResource'> = {
    photo_url: person.photo_url, contacts: { ...person.contacts! }, contacts_public: true,
  }
  const me: Schema<'MeResource'> = {
    user: { id: 'u1', phone: null, email: 'anna@example.test', ical_url: 'https://church.example.test/calendar/' + 'long-token-'.repeat(8) + '.ics' },
    person: { id: 'p1', first_name: 'Анна', last_name: person.last_name, patronymic: person.patronymic, status: 'member' },
    permissions: { administrator: true, global: [], ministries: { m1: ['members.manage', 'roles.manage', 'ministry.edit', 'events.manage', 'announcements.publish'] } },
  }
  const settings: Schema<'SettingsResource'> = {
    church_name: 'Наша церковь', timezone: 'Europe/Moscow', phone_region: 'RU', reverb_key: 'acceptance', vapid_public_key: '',
  }
  const role: Schema<'RoleResource'> = {
    id: 'r1', scope: 'global', ministry_id: null,
    name: long ? 'КоординаторПодготовки'.repeat(4) : 'Координатор',
    description: 'Помогает организовать подготовку событий.', is_system: false, permissions: ['people.view'],
  }
  const ministryRole: Schema<'RoleResource'> = { ...role, id: 'rm1', scope: 'ministry', ministry_id: 'm1', permissions: ['events.manage'] }
  const permissions: Schema<'PermissionResource'>[] = [
    { key: 'people.view', scope: 'global', label: 'Видеть справочник', description: 'Список людей и карточка: ФИО, фото, статус, служения.' },
    { key: 'people.manage', scope: 'global', label: 'Управлять людьми', description: 'Создавать, редактировать и архивировать людей, менять ФИО и статус, стирать данные.' },
    { key: 'events.manage', scope: 'ministry', label: 'Управлять событиями служения', description: 'События и шаблоны служения, все их слоты, отмена, чат события.' },
    { key: 'members.manage', scope: 'ministry', label: 'Управлять составом', description: 'Добавлять и исключать участников, выдавать и снимать роли служения.' },
  ]
  const media: Schema<'MediaResource'>[] = [
    ...Object.entries(mediaFiles).map(([id, file]) => ({ id: 'media-' + id, kind: 'image', status: 'ready', url: mediaUrl(file.name), thumb_url: mediaUrl(file.name) })),
    { id: 'media-document', kind: 'file', status: 'ready', url: mediaUrl(longFileName), thumb_url: null },
  ]
  const event: Schema<'EventResource'> = {
    id: 'e1', chat_id: 'c1', owner_type: 'church', ministry: null, template_id: null, occurrence_date: null,
    title: 'Воскресное событие и совместный обед', description: 'Встречаемся всей церковью. После события приглашаем остаться на общение.',
    location: 'Главный зал', starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T09:00:00Z',
    visibility: 'church', status: 'scheduled', cancelled_at: null, cancel_reason: null, can_manage: true, attachments: media,
    slots: [{ id: 's1', label: 'Помощь в подготовке зала', resource_type: 'person', role: null,
      required_count: 3, filled_count: 1, sort_order: 0, can_fill: true,
      assignments: [{ id: 'as1', person: { id: person.id, full_name: person.full_name, photo_thumb_url: person.photo_url }, created_at: now }] }],
  }
  const template: Schema<'EventTemplateResource'> = {
    id: 't1', owner_type: 'church', ministry: null, title: 'Воскресное событие', description: 'Еженедельное событие для всей церкви',
    location: 'Главный зал', visibility: 'church', start_time: '10:00', duration_minutes: 120,
    recurrence: { type: 'weekly', weekday: 7 }, active: true, generated_until: '2027-01-01', archived: false, can_manage: true,
    slots: [{ id: 'ts1', label: 'Подготовка', role: null, required_count: 3, sort_order: 0 }],
  }
  const announcement: Schema<'AnnouncementResource'> = {
    id: 'a1', scope: 'church', ministry: null, author: { id: 'u1', full_name: person.full_name },
    title: long ? 'Объявление'.repeat(20) : 'Подготовка к воскресенью',
    body: '## Приглашаем всех\nВстречаемся в **10:00**. После события будет совместный обед.\n\n- Помогите подготовить зал\n- Возьмите ноты\n\n[Подробности](https://example.test/' + 'long-link'.repeat(20) + ')',
    pinned: true, hide_after: null, notify_on_publish: true, published_at: now, archived: false, views_count: 18, attachments: media,
  }
  const messages: Schema<'MessageResource'>[] = Array.from({ length: 8 }, (_, i) => ({
    id: 'msg' + i, chat_id: 'c1', sender: { id: i % 2 ? 'u2' : 'u1', person: { id: i % 2 ? 'p2' : 'p1', full_name: i % 2 ? 'Михаил Орлов' : person.full_name, photo_thumb_url: person.photo_url } },
    body: i % 2 ? 'Спасибо! Приду пораньше и помогу подготовить зал.' : 'Всем добрый день! Репетиция в субботу в 18:00. Возьмите ноты и проверьте расписание.',
    reply_to: i === 6 ? { id: 'msg5', sender_name: 'Михаил Орлов', body_preview: 'Спасибо! Приду пораньше.', deleted: false } : null,
    attachments: i === 4 ? media : [], edited_at: null, deleted: false, created_at: now, cursor: 'cursor' + i,
  }))
  const chat: Schema<'ChatResource'> = {
    id: 'c1', type: 'group', title: 'Подготовка воскресного события', avatar_url: person.photo_url, ministry_id: null, event_id: null,
    archived: false, last_message_at: now, last_message: { id: 'msg7', body_preview: messages[7]!.body!, created_at: now, deleted: false },
    unread_count: 3, muted_until: null, is_owner: true,
    members: [
      { user_id: 'u1', person_id: 'p1', full_name: person.full_name, photo_url: person.photo_url, is_owner: true, joined_at: now },
      { user_id: 'u2', person_id: 'p2', full_name: 'Михаил Орлов', photo_url: null, is_owner: false, joined_at: now },
    ], pinned_messages: [], can_write: true, can_moderate: true, can_manage_members: true,
  }
  const member: Schema<'MemberResource'> = { id: 'mem1', ministry_id: 'm1', person_id: 'p1', full_name: person.full_name, joined_at: now, photo_url: person.photo_url, roles: [{ id: 'rm1', name: ministryRole.name }] }
  const notifications: Success<'notificationCenter.index'> = {
    data: [{ id: 'n1', category: 'assignments', title: 'Вы назначены на событие', body: event.title, url: '/events/e1', read_at: null, created_at: now }],
    next_cursor: null, meta: { unread_count: 1 },
  }
  const audit: Success<'access.audit'> = {
    data: [{ id: 'audit1', action: 'person.created', actor: { id: 'u1', person_id: 'p1', name: person.full_name }, subject_type: 'person', subject_id: '01K8Z6N6Y9KBNF147JGEY650VM', payload: null, ip: '127.0.0.1', created_at: now }], next_cursor: null,
  }
  const sessions: Schema<'SessionResource'>[] = [
    { id: 'session1', ip_address: '127.0.0.1', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', last_activity: now, current: true },
    { id: 'session2', ip_address: '192.0.2.10', user_agent: 'UnknownBrowser/' + 'long-agent-'.repeat(30), last_activity: now, current: false },
  ]
  const categories: Schema<'NotificationSettingResource'>[] = [
    { category: 'announcements', label: 'Объявления', enabled: true },
    { category: 'chat', label: 'Чаты', enabled: true },
    { category: 'assignments', label: 'Назначения', enabled: true },
    { category: 'reminders', label: 'Напоминания', enabled: false },
  ]
  return { person, profile, me, settings, ministry, role, ministryRole, permissions, media, event, template, announcement, messages, chat, member, notifications, audit, sessions, categories }
}

/** Real Nuxt/CSS and decoded local bytes; no server permissions or nginx claim. */
export async function installAcceptanceApi(page: Page, options: { guest?: boolean, long?: boolean, empty?: boolean } = {}) {
  // setFixedTime changes Date only; timers still run for debounce/polling.
  // Every acceptance case shares the dates used by calendar/media/chat data.
  await page.clock.setFixedTime(new Date(now))
  const data = createData(options.long ?? false)
  const unhandled: string[] = []
  const overrides = new Map<string, Handler>()
  const selected = <T>(items: T[]) => options.empty ? [] : items
  const people = (): Success<'person.index'> => paginated(selected([data.person, { ...data.person, id: 'p2', first_name: 'Михаил', last_name: 'Орлов', patronymic: null, full_name: 'Орлов Михаил', user_id: 'u2' }]))
  const events = (request: Request): Success<'event.index'> => {
    const scope = new URL(request.url()).searchParams.get('scope')
    const event: Schema<'EventResource'> = scope === 'ministry:m1'
      ? { ...data.event, owner_type: 'ministry', ministry: { id: 'm1', name: data.ministry.name } }
      : data.event
    return paginated(selected([event, { ...event, id: 'e2', title: 'Отменённая репетиция', status: 'cancelled', cancelled_at: now, cancel_reason: 'Изменилось расписание' }]))
  }
  const announcements = (request: Request): Success<'announcement.index'> => {
    const ministry = new URL(request.url()).searchParams.get('scope') === 'ministry'
    const item: Schema<'AnnouncementResource'> = ministry
      ? { ...data.announcement, scope: 'ministry', ministry: { id: 'm1', name: data.ministry.name } }
      : data.announcement
    return paginated(selected([item]))
  }
  const templates = (): Success<'template.index'> => ({ data: selected([data.template]) })
  const chats = (): Success<'chat.index'> => {
    const { id, type, title, avatar_url, ministry_id, event_id, archived, last_message_at, last_message, unread_count, muted_until, is_owner } = data.chat
    return { data: selected([{ id, type, title, avatar_url, ministry_id, event_id, archived, last_message_at, last_message, unread_count, muted_until, is_owner }]), meta: { unread_total: options.empty ? 0 : unread_count } }
  }
  const history = (request: Request): Success<'message.index'> => {
    const query = new URL(request.url()).searchParams
    const before = query.get('before'), after = query.get('after')
    const boundary = before ?? after
    const index = boundary ? data.messages.findIndex(message => message.cursor === boundary) : -1
    if (boundary && index < 0) unhandled.push('GET /chats/c1/messages: unknown cursor ' + boundary)
    const records = !boundary ? data.messages : index < 0 ? [] : before ? data.messages.slice(0, index) : data.messages.slice(index + 1)
    return { data: selected(records), next_before: null, next_after: null }
  }
  const roleUsage: Success<'role.usage'> = { data: { carriers: 2, blockers: [{ type: 'person', id: 'p1', title: data.person.full_name }] } }

  const gets: Record<string, (request: Request) => unknown> = {
    '/auth/me': () => data.me,
    '/settings': () => ({ data: data.settings }),
    '/people': people,
    '/people/p1': () => ({ data: data.person }),
    '/me/profile': () => ({ data: data.profile }),
    '/ministries': () => ({ data: selected([data.ministry]) }),
    '/ministries/m1': () => ({ data: data.ministry }),
    '/ministries/m1/members': () => ({ data: selected([data.member]) }),
    '/ministries/m1/roles': () => ({ data: [data.ministryRole] }),
    '/roles': () => ({ data: [data.role, { ...data.role, id: 'r-system', name: 'Администратор', is_system: true }] }),
    '/permissions': () => ({ data: data.permissions }),
    '/roles/r1/usage': () => roleUsage,
    '/roles/rm1/usage': () => roleUsage,
    '/calendar/slot-choices': () => ({ data: [{ id: 'm1', name: data.ministry.name, roles: [{ id: 'rm1', name: data.ministryRole.name }] } satisfies Schema<'SlotChoicesResource'>] }),
    '/events': events,
    '/events/e1': () => ({ data: data.event }),
    '/templates': templates,
    '/templates/t1': () => ({ data: data.template }),
    '/announcements': announcements,
    '/announcements/a1': () => ({ data: data.announcement }),
    '/chats': chats,
    '/chats/c1': () => ({ data: data.chat }),
    '/chats/c1/messages': history,
    '/slots/s1/candidates': () => ({ data: [{ person: { id: 'p1', full_name: data.person.full_name, photo_thumb_url: data.person.photo_url }, has_role: true, conflicts: [] } satisfies Schema<'CandidateResource'>] }),
    '/notifications': () => options.empty ? { data: [], next_cursor: null, meta: { unread_count: 0 } } : data.notifications,
    '/notification-settings': () => ({ data: data.categories }),
    '/auth/sessions': () => ({ data: data.sessions }),
    '/audit': () => options.empty ? { data: [], next_cursor: null } : data.audit,
    '/access-links/acceptance-invite': () => ({ data: { kind: 'invite', person: { first_name: 'Анна', last_name: data.person.last_name }, login_hint: { phone: null, email: 'anna@example.test' } } satisfies Schema<'AccessLinkResource'> }),
    '/access-links/acceptance-reset': () => ({ data: { kind: 'password_reset', person: { first_name: 'Анна', last_name: data.person.last_name }, login_hint: { phone: null, email: 'anna@example.test' } } satisfies Schema<'AccessLinkResource'> }),
  }
  for (const message of data.messages) {
    gets['/messages/' + message.id] = () => ({ data: message } satisfies Success<'message.show'>)
  }
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }))
  await page.route('**/broadcasting/auth', route => route.fulfill({ json: { auth: 'acceptance:signature' } }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '')
    const method = request.method()
    const handler = overrides.get(method + ' ' + path)
    if (handler) {
      const reply = await handler(request)
      await route.fulfill(reply.json === undefined ? { status: reply.status ?? 204 } : { status: reply.status ?? 200, json: reply.json })
    } else if (method === 'GET' && path === '/auth/me' && options.guest) {
      await route.fulfill({ status: 401, json: { message: 'Unauthenticated.' } })
    } else if (method === 'GET' && path === '/templates' && !['0', '1'].includes(new URL(request.url()).searchParams.get('archived') ?? '0')) {
      unhandled.push('GET /templates: archived must use Laravel-compatible 0/1')
      await route.fulfill({ status: 422, json: { message: 'Поле «архивные» должно быть «да» или «нет».', errors: { archived: ['Ожидается 0 или 1.'] } } })
    } else if (method === 'GET' && gets[path]) {
      await route.fulfill({ json: gets[path](request) })
    } else if (method === 'POST' && path === '/chats/c1/read') {
      if (!data.messages.some(message => message.id === request.postDataJSON()?.message_id)) {
        unhandled.push(method + ' ' + path + ': invalid message_id')
        await route.fulfill({ status: 422, json: { message: 'Сообщение не найдено.' } })
      } else {
        data.chat.unread_count = 0
        const body: Success<'chat.chatRead'> = { unread_count: 0, unread_total: 0 }
        await route.fulfill({ status: 200, json: body })
      }
    } else {
      unhandled.push(method + ' ' + path)
      await route.fulfill({ status: 501, json: { message: 'Missing acceptance fixture: ' + method + ' ' + path } })
    }
  })
  await page.route('**/__acceptance_media/**', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice('/__acceptance_media/'.length))
    const file = Object.values(mediaFiles).find(file => file.name === name)
    if (file) {
      await route.fulfill({ path: fileURLToPath(new URL('../fixtures/' + file.name, import.meta.url)), contentType: 'image/jpeg' })
    } else if (name === longFileName) {
      await route.fulfill({ path: fileURLToPath(new URL('../fixtures/document.txt', import.meta.url)), contentType: 'text/plain; charset=utf-8' })
    } else if (name === 'broken.png') {
      await route.fulfill({ status: 404, body: 'Not found' })
    } else {
      unhandled.push('MEDIA ' + name)
      await route.fulfill({ status: 501, body: 'Missing acceptance media fixture' })
    }
  })
  await page.routeWebSocket('**/app/**', (socket) => {
    socket.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1.1', activity_timeout: 120 }) }))
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.event === 'pusher:subscribe') socket.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: message.data.channel, data: '{}' }))
      if (message.event === 'pusher:ping') socket.send(JSON.stringify({ event: 'pusher:pong', data: '{}' }))
    })
  })
  return {
    data, unhandled,
    respond(method: string, path: string, handler: Handler) { overrides.set(method + ' ' + path, handler) },
  }
}
