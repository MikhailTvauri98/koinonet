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
  await mainNav(page).getByRole('link', { name: section, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
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

export function fullName(person: NewPerson): string {
  return `${person.lastName} ${person.firstName}`
}

// Человек открывает приложение и, не войдя, попадает на экран входа.
export async function login(page: Page, loginValue: string, password: string): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
  await page.getByLabel('Телефон или email').fill(loginValue)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
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
  await page.getByTestId('create-role').click()
  await page.getByLabel('Название').fill(name)
  for (const permission of permissions) {
    await page.getByLabel(permission, { exact: true }).check()
  }
  await page.getByTestId('save-role').click()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
}

export async function createMinistry(page: Page, name: string): Promise<void> {
  await openSection(page, 'Служения', 'Служения')
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill(name)
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
}

export async function createPerson(page: Page, person: NewPerson): Promise<void> {
  await openSection(page, 'Люди', 'Люди')
  await page.getByRole('button', { name: 'Создать человека' }).click()
  const form = page.getByRole('form', { name: 'Новый человек' })
  await form.getByLabel('Фамилия').fill(person.lastName)
  await form.getByLabel('Имя').fill(person.firstName)
  await form.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Человек создан.' })).toBeVisible()
}

// Карточка открывается из справочника через поиск по фамилии.
export async function openPersonCard(page: Page, person: NewPerson): Promise<void> {
  await openSection(page, 'Люди', 'Люди')
  await page.getByLabel('Поиск по имени и фамилии').fill(person.lastName)
  await page.getByRole('list', { name: 'Список людей' }).getByRole('link', { name: fullName(person) }).click()
  await expect(page.getByRole('heading', { level: 1, name: fullName(person) })).toBeVisible()
}

// На открытой карточке человека.
export async function grantGlobalRole(page: Page, role: string): Promise<void> {
  await page.getByRole('button', { name: 'Изменить роли' }).click()
  await page.getByRole('group', { name: 'Роли человека' }).getByLabel(role, { exact: true }).check()
  await page.getByRole('button', { name: 'Сохранить роли' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Изменения сохранены.' })).toBeVisible()
  const globalRoles = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Глобальные роли' }) })
  await expect(globalRoles.getByRole('listitem').filter({ hasText: role })).toBeVisible()
}

// На открытой карточке человека: одноразовая ссылка из окна приглашения.
export async function takeInviteLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Приглашение' })
  const link = (await dialog.getByTestId('invite-link').innerText()).trim()
  expect(link.startsWith(`${e2e.webOrigin}/invite/`), `ссылка приглашения ведёт в предпросмотр: ${link}`).toBe(true)
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).toBeHidden()
  return link
}

// Принятие приглашения сразу входит под новым аккаунтом (раздел 7.2).
export async function acceptInvite(phone: Page, link: string, person: NewPerson & { login: string }): Promise<void> {
  await phone.goto(link)
  await expect(phone.getByRole('heading', { level: 1, name: 'Приглашение' })).toBeVisible()
  await expect(phone.getByText(`Здравствуйте, ${person.firstName} ${person.lastName}!`)).toBeVisible()
  await phone.getByLabel('Телефон или email').fill(person.login)
  await phone.getByLabel('Пароль', { exact: true }).fill(credentials.invitedPassword)
  await phone.getByLabel('Повторите пароль').fill(credentials.invitedPassword)
  await phone.getByRole('button', { name: 'Создать аккаунт' }).click()
  await expect(phone).toHaveURL('/')
  await expect(phone.getByRole('heading', { level: 1, name: `Здравствуйте, ${person.firstName}!` })).toBeVisible()
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
