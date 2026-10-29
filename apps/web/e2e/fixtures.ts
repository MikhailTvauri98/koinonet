import { test as base, devices, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { credentials, e2e } from './environment'

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
export const test = base.extend<{ openPhone: () => Promise<Page> }>({
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

// Основная навигация (AppNav): боковая панель на десктопе, нижняя панель
// вкладок на телефоне. Разделы открываются через неё, как это делает
// человек, а не вводом адреса.
export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Основная навигация' })
}

export async function openSection(page: Page, section: string, heading: string): Promise<void> {
  const name = section === 'Уведомления' ? /^Уведомления(?: Непрочитанных: \d+)?$/ : section
  const link = mainNav(page).getByRole('link', { name, exact: true })
  const path = await link.getAttribute('href')
  const requests: Record<string, string[]> = {
    '/': ['/announcements'],
    '/people': ['/people', '/ministries'],
    '/ministries': ['/ministries'],
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
    ...(path === '/' ? [successfulGet(page, '/announcements')] : []),
    navigate(),
  ])
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
// растягивает `innerWidth` под вылезшее содержимое. Навигация прокручивается
// внутри себя и ширину документа не меняет.
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const viewport = page.viewportSize()
  expect(viewport, 'у телефона задан размер экрана').not.toBeNull()
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `${where}: страница не шире экрана`).toBeLessThanOrEqual(viewport!.width)
}

export function fullName(person: NewPerson): string {
  return `${person.lastName} ${person.firstName}`
}

// Entry now waits for auth.setMe -> settings -> the initial notification
// snapshot before router.push. Synchronize that HTTP lifecycle explicitly;
// the short URL/heading assertions still prove the resulting screen.
async function enterAccount(page: Page, submit: Locator, path: string, status = 200): Promise<void> {
  const [authenticated, initialized] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST'),
    page.waitForResponse(response => response.url().endsWith('/api/v1/notifications') && response.request().method() === 'GET'),
    successfulGet(page, '/announcements'),
    submit.click(),
  ])
  expect(authenticated.status()).toBe(status)
  expect(initialized.status()).toBe(200)
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
  await page.getByLabel('Название').fill(name)
  for (const permission of permissions) {
    await page.getByLabel(permission, { exact: true }).check()
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
  await expect(page.getByRole('link', { name })).toBeVisible()
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
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
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
    dialog.getByLabel('Поиск по имени и фамилии').fill(lastName),
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
