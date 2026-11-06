import { test as base, devices, expect, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { apiRuntime, credentials, e2e } from './environment'

// Общие шаги сценариев. Всё — через интерфейс, как это делает человек:
// без запросов к API в обход экранов и без обращения к базе.

export interface NewPerson {
  lastName: string
  firstName: string
}

export interface InvitedPerson extends NewPerson {
  // Телефон или email, который приглашённый задаёт себе при создании аккаунта.
  login: string
  // Глобальная роль, которую администратор выдаёт перед приглашением.
  globalRole: string
}

// Приглашённые открывают ссылку на своём телефоне: отдельный контекст
// браузера (свои cookie, свой вход) с мобильным экраном. Контексты
// закрываются по завершении теста, трассировка и снимки падения в них
// сохраняются так же, как в основной странице.
export const test = base.extend<{ resetCache: undefined, openPhone: () => Promise<Page> }>({
  // Automatic fixture выполняется у каждого теста во всех файлах. Общий
  // beforeEach при импорте модуля регистрировался бы только в первом файле.
  // Изолированный кеш сбрасывает лимиты предыдущего сценария; внутри нового
  // сценария ограничения остаются штатными. Зависимостей у фикстуры нет.
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
  resetCache: [async ({}, use) => {
    runArtisan(['tinker', '--execute', [
      '$redis = Illuminate\\Support\\Facades\\Redis::connection("cache");',
      'if (Illuminate\\Support\\Facades\\DB::connection()->getConfig("database") !== "church_e2e" || (string) $redis->client()->getDBNum() !== "15") {',
      'throw new RuntimeException("Refusing to clear cache outside the isolated E2E environment.");',
      '}',
      '$redis->flushdb();',
    ].join(' ')])
    await use(undefined)
  }, { auto: true }],
  openPhone: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    await use(async () => {
      const context = await browser.newContext({
        ...devices['Pixel 7'],
        baseURL: e2e.webOrigin,
        serviceWorkers: 'block',
      })
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map(context => context.close()))
  },
})

export { expect }

// Commands share exactly the guarded API runtime used by global-setup: the
// disposable church_e2e database and Redis 14/15, locally in Docker or in CI.
// Arguments are separate values, never a shell command or an implicit host PHP.
export function runArtisan(args: string[]): string {
  const spec = apiRuntime.artisan(args)
  try {
    return execFileSync(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 180_000,
    })
  } catch (error) {
    // Killing the Docker client on timeout does not stop its container. Remove
    // only this command's own container; preserve the original command error.
    if (spec.container) {
      const cleanup = apiRuntime.removeContainers([spec.container])
      try {
        execFileSync(cleanup.command, cleanup.args, {
          cwd: cleanup.cwd,
          env: cleanup.env,
          stdio: 'ignore',
          windowsHide: true,
          timeout: 60_000,
        })
      } catch { /* Global teardown also cleans up labelled E2E containers. */ }
    }
    throw error
  }
}

// Основная навигация (AppNav): боковая панель на десктопе, нижняя панель
// вкладок и меню «Ещё» на телефоне. Разделы открываются через неё, как это делает
// человек, а не вводом адреса.
export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Основная навигация' })
}

export async function openSection(page: Page, section: string, heading: string): Promise<void> {
  const name = section === 'Уведомления' ? /^Уведомления(?: Непрочитанных: \d+)?$/ : section === 'Чаты' ? /^Чаты(?: Непрочитанных: \d+)?$/ : section
  let link = mainNav(page).getByRole('link', { name, exact: true })
  const more = mainNav(page).getByRole('button', { name: 'Ещё', exact: true })
  if (!await link.isVisible() && await more.isVisible()) {
    await more.click()
    link = page.getByRole('dialog', { name: 'Ещё', exact: true }).getByRole('link', { name, exact: true })
  }
  const path = await link.getAttribute('href')
  const requests: Record<string, string[]> = {
    '/': ['/announcements', '/events'],
    '/chats': ['/chats'],
    '/people': ['/people', '/ministries'],
    '/ministries': ['/ministries'],
    '/calendar': ['/events'],
    '/templates': ['/templates', '/ministries'],
    '/announcements': ['/announcements'],
    '/notifications': ['/notifications'],
    '/settings/profile': ['/me/profile'],
    '/admin/roles': ['/roles'],
    '/admin/settings': ['/settings'],
    '/admin/audit': ['/audit'],
  }
  const entering = path && new URL(page.url()).pathname !== path
  await Promise.all([
    ...(entering ? (requests[path] ?? []).map(endpoint => successfulGet(page, endpoint, heading === 'Вход' ? 401 : 200)) : []),
    link.click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
}

async function successfulGet(page: Page, endpoint: string, status = 200): Promise<void> {
  await expectApiResponse(page, 'GET', endpoint, status)
}

export async function expectApiResponse(page: Page, method: string, endpoint: string, status: number): Promise<void> {
  const response = await page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1${endpoint}` && response.request().method() === method)
  expect(response.status(), `${method} ${endpoint}`).toBe(status)
}

// Permission retries must complete the new auth initialization before another
// reload, otherwise a two-second element check repeatedly abandons live requests.
export async function reloadAuthenticated(page: Page): Promise<void> {
  await initializeDocument(page, () => page.reload(), new URL(page.url()).pathname)
}

export async function visitAuthenticated(page: Page, url: string): Promise<void> {
  await initializeDocument(page, () => page.goto(url), new URL(url, e2e.webOrigin).pathname)
}

async function initializeDocument(page: Page, navigate: () => Promise<unknown>, path: string): Promise<void> {
  await Promise.all([
    successfulGet(page, '/auth/me'), successfulGet(page, '/notifications'),
    ...(path === '/' ? [successfulGet(page, '/announcements'), successfulGet(page, '/events')] : []),
    successfulGet(page, '/chats'),
    navigate(),
  ])
  const heading = /^\/(?:chats\/[^/]+|ministries\/[^/]+\/chat)$/.test(path)
    ? page.locator('.chat-screen').getByRole('heading', { level: 1 })
    : page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
}

// На телефоне навигация — панель вкладок, прижатая к нижнему краю экрана.
export async function expectPhoneTabBar(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  const box = await mainNav(page).boundingBox()
  expect(viewport, 'у телефона задан размер экрана').not.toBeNull()
  expect(box, 'навигация видна').not.toBeNull()
  expect(Math.round(box!.y + box!.height)).toBe(viewport!.height)
  expect(Math.round(box!.width)).toBe(viewport!.width)
}

// Экран не шире телефона: ничего не выталкивает страницу вбок. Сравнение —
// с шириной экрана устройства, а не с `innerWidth`: мобильный браузер
// растягивает `innerWidth` под вылезшее содержимое. Нижняя панель и меню
// «Ещё» также должны помещаться без горизонтальной прокрутки.
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const viewport = page.viewportSize()
  expect(viewport, 'у телефона задан размер экрана').not.toBeNull()
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `${where}: страница не шире экрана`).toBeLessThanOrEqual(viewport!.width)
}

export function fullName(person: NewPerson): string {
  return `${person.lastName} ${person.firstName}`
}

// Buffer fast responses from before submit, but start each 15s budget only
// after its prerequisite stage. A home response cannot arrive until login,
// settings, notifications and chats initialization have all finished. Reverb
// auth can occupy the single PHP server first (measured 19.7s); its transport
// stage uses the same 20s bound as the real subscription observers.
async function enterAccount(page: Page, submit: Locator, path: string, status = 200): Promise<void> {
  const keys = [
    `POST ${path}`, 'GET /api/v1/notifications', 'GET /api/v1/chats',
    'POST /broadcasting/auth', 'GET /api/v1/announcements', 'GET /api/v1/events',
  ]
  const received = new Map<string, Response>()
  const waiting = new Map<string, (response: Response) => void>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const capture = (response: Response) => {
    const key = `${response.request().method()} ${new URL(response.url()).pathname}`
    if (!keys.includes(key) || received.has(key)) return
    received.set(key, response)
    waiting.get(key)?.(response)
  }
  const stage = async (key: string, expected = 200, timeout = 15_000) => {
    const response = received.get(key) ?? await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(key); reject(new Error(`Account initialization timed out: ${key}`)) }, timeout)
      timers.add(timer)
      waiting.set(key, response => { clearTimeout(timer); timers.delete(timer); waiting.delete(key); resolve(response) })
    })
    expect(response.status(), key).toBe(expected)
  }
  page.on('response', capture)
  try {
    await submit.click()
    await stage(keys[0]!, status)
    await stage(keys[1]!)
    await stage(keys[2]!)
    await stage(keys[3]!, 200, 20_000)
    // Requests may queue behind each other in the built-in PHP server. Buffer
    // both early, but do not charge the previous response to the next budget.
    await stage(keys[4]!)
    await stage(keys[5]!)
  } finally {
    page.off('response', capture)
    timers.forEach(timer => clearTimeout(timer))
  }
}

// Человек открывает приложение и, не войдя, попадает на экран входа.
export async function login(page: Page, loginValue: string, password: string): Promise<void> {
  await Promise.all([successfulGet(page, '/auth/me', 401), page.goto('/')])
  await expect(page).toHaveURL('/login')
  await page.getByLabel('Телефон или email').fill(loginValue)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await enterAccount(page, page.getByRole('button', { name: 'Войти' }), '/api/v1/auth/login')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1, name: /^Здравствуйте, / })).toBeVisible()
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, credentials.admin.login, credentials.admin.password)
  await expect(page.getByRole('heading', { level: 1, name: `Здравствуйте, ${credentials.admin.firstName}!` })).toBeVisible()
}

// Глобальная роль с правами из каталога; права называются так, как их
// показывает редактор ролей.
export async function createGlobalRole(page: Page, name: string, permissions: string[]): Promise<void> {
  await openSection(page, 'Роли', 'Глобальные роли')
  await Promise.all([successfulGet(page, '/permissions'), page.getByTestId('create-role').click()])
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill(name)
  for (const permission of permissions) {
    // Descriptions are visible inside the label; match its catalogue title
    // first, rather than a substring that might occur in another description.
    const title = permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page.getByRole('checkbox', { name: new RegExp('^' + title + '(?:\\s|$)') }).check()
  }
  await Promise.all([
    expectApiResponse(page, 'POST', '/roles', 201),
    successfulGet(page, '/permissions'), // Newly created role remounts its editor.
    page.getByTestId('save-role').click(),
  ])
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

export async function createMinistry(page: Page, name: string): Promise<void> {
  await openSection(page, 'Служения', 'Служения')
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill(name)
  // The successful POST refreshes the list; on a slow Docker bind mount that
  // GET can exceed the short element assertion timeout. Register before submit.
  await Promise.all([
    expectApiResponse(page, 'POST', '/ministries', 201),
    successfulGet(page, '/ministries'),
    page.getByRole('button', { name: 'Создать', exact: true }).click(),
  ])
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
}

export async function createPerson(page: Page, person: NewPerson): Promise<void> {
  await openSection(page, 'Люди', 'Люди')
  await page.getByRole('button', { name: 'Создать человека' }).click()
  const form = page.getByRole('form', { name: 'Новый человек' })
  await form.getByLabel('Фамилия').fill(person.lastName)
  await form.getByLabel('Имя').fill(person.firstName)
  await Promise.all([
    expectApiResponse(page, 'POST', '/people', 201),
    successfulGet(page, '/people'),
    form.getByRole('button', { name: 'Создать' }).click(),
  ])
  await expect(page.getByRole('status').filter({ hasText: 'Человек создан.' })).toBeVisible()
}

// Карточка открывается из справочника через поиск по фамилии.
export async function openPersonCard(page: Page, person: NewPerson): Promise<void> {
  await openSection(page, 'Люди', 'Люди')
  const [searched] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/people'
      && new URL(response.url()).searchParams.get('search') === person.lastName && response.request().method() === 'GET'),
    page.getByLabel('Поиск по имени и фамилии').fill(person.lastName),
  ])
  expect(searched.status()).toBe(200)
  const link = page.getByRole('list', { name: 'Список людей' }).getByRole('link', { name: fullName(person) })
  const path = (await link.getAttribute('href'))!
  await Promise.all([successfulGet(page, path), link.click()])
  await expect(page.getByRole('heading', { level: 1, name: fullName(person) })).toBeVisible()
}

// На открытой карточке человека.
export async function grantGlobalRole(page: Page, role: string): Promise<void> {
  await Promise.all([successfulGet(page, '/roles'), page.getByRole('button', { name: 'Изменить роли' }).click()])
  await page.getByRole('group', { name: 'Роли человека' }).getByLabel(role, { exact: true }).check()
  const path = new URL(page.url()).pathname
  await Promise.all([
    expectApiResponse(page, 'PUT', `${path}/roles`, 200),
    successfulGet(page, path),
    page.getByRole('button', { name: 'Сохранить роли' }).click(),
  ])
  await expect(page.getByRole('status').filter({ hasText: 'Изменения сохранены.' })).toBeVisible()
  const globalRoles = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Глобальные роли' }) })
  await expect(globalRoles.getByRole('listitem').filter({ hasText: role })).toBeVisible()
}

// На открытой карточке человека: одноразовая ссылка из окна приглашения.
export async function takeInviteLink(page: Page): Promise<string> {
  await Promise.all([
    expectApiResponse(page, 'POST', `${new URL(page.url()).pathname}/invite`, 201),
    page.getByRole('button', { name: 'Пригласить' }).click(),
  ])
  const dialog = page.getByRole('dialog', { name: 'Приглашение' })
  const link = (await dialog.getByTestId('invite-link').innerText()).trim()
  expect(link.startsWith(`${e2e.webOrigin}/invite/`), `ссылка приглашения ведёт в предпросмотр: ${link}`).toBe(true)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
  return link
}

// Принятие приглашения сразу входит под новым аккаунтом (раздел 7.2).
export async function acceptInvite(phone: Page, link: string, person: NewPerson & { login: string }): Promise<void> {
  const accessPath = new URL(link).pathname.replace('/invite/', '/access-links/')
  await Promise.all([successfulGet(phone, '/auth/me', 401), successfulGet(phone, accessPath), phone.goto(link)])
  await expect(phone.getByRole('heading', { level: 1, name: 'Приглашение' })).toBeVisible()
  await expect(phone.getByText(`Здравствуйте, ${person.firstName} ${person.lastName}!`)).toBeVisible()
  await phone.getByLabel('Телефон или email').fill(person.login)
  await phone.getByLabel('Пароль', { exact: true }).fill(credentials.invitedPassword)
  await phone.getByLabel('Повторите пароль').fill(credentials.invitedPassword)
  await enterAccount(phone, phone.getByRole('button', { name: 'Создать аккаунт' }), `/api/v1${accessPath}/accept`, 201)
  await expect(phone).toHaveURL('/')
  await expect(phone.getByRole('heading', { level: 1, name: `Здравствуйте, ${person.firstName}!` })).toBeVisible()
}

// Called on the ministry members tab by both ministry and announcement scenarios.
export async function addMember(page: Page, lastName: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Добавить участника' }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить участника' })
  const [searched] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/people'
      && new URL(response.url()).searchParams.get('search') === lastName && response.request().method() === 'GET'),
    dialog.getByLabel('Найти человека').fill(lastName),
  ])
  expect(searched.status()).toBe(200)
  await Promise.all([
    expectApiResponse(page, 'POST', new URL(page.url()).pathname, 201),
    dialog.getByRole('button', { name, exact: true }).click(),
  ])
  await expect(dialog).toBeHidden()
}

// Человек с аккаунтом: администратор создаёт его, выдаёт глобальную роль и
// приглашает, человек принимает приглашение на своём телефоне. Возвращает
// страницу вошедшего человека.
export async function createInvitedAccount(adminPage: Page, openPhone: () => Promise<Page>, person: InvitedPerson): Promise<Page> {
  await createPerson(adminPage, person)
  await openPersonCard(adminPage, person)
  await grantGlobalRole(adminPage, person.globalRole)
  const link = await takeInviteLink(adminPage)
  const phone = await openPhone()
  await acceptInvite(phone, link, person)
  return phone
}
