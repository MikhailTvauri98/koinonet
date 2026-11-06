import type { Page } from '@playwright/test'
import {
  addMember, createGlobalRole, createInvitedAccount, createMinistry, createPerson, expect, expectApiResponse, expectNoHorizontalScroll, fullName,
  loginAsAdmin, mainNav, openSection, reloadAuthenticated, test, visitAuthenticated,
} from './fixtures'

// Лидер управляет составом своего служения и не может управлять чужим.
// Имена данных — свои у каждого файла сценариев, поэтому сценарии не
// зависят друг от друга и от порядка запуска.

const leader = { lastName: 'Сидоров', firstName: 'Сергей', login: 'sidorov@e2e.test', globalRole: 'Прихожанин' }
const newcomer = { lastName: 'Кузнецова', firstName: 'Анна' }

// Состав служения открывается так же, как его открывает человек: список
// служений в навигации → служение → вкладка «Участники».
async function openMembersFromNav(page: Page, ministry: string): Promise<void> {
  await openSection(page, 'Служения', 'Служения')
  const link = page.getByRole('link', { name: ministry, exact: true })
  const path = (await link.getAttribute('href'))!
  await Promise.all([expectApiResponse(page, 'GET', path, 200), link.click()])
  await expect(page.getByRole('heading', { level: 1, name: ministry })).toBeVisible()
  await Promise.all([
    expectApiResponse(page, 'GET', `${path}/members`, 200),
    expectApiResponse(page, 'GET', `${path}/roles`, 200),
    page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'Участники' }).click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
}

function memberRow(page: Page, name: string) {
  return page.getByTestId('member-row').filter({ hasText: name })
}

test('a leader manages members of their own ministry only', async ({ page, openPhone }) => {
  // Several real account initializations now include settings/notification HTTP.
  test.setTimeout(240_000)
  await loginAsAdmin(page)

  // Глобальная роль приглашённого даёт справочник, но не права служений.
  await createGlobalRole(page, leader.globalRole, ['Видеть справочник'])
  await createMinistry(page, 'Прославление')
  await createMinistry(page, 'Молодёжное')
  await createPerson(page, newcomer)
  const leaderPhone = await createInvitedAccount(page, openPhone, leader)

  // Адрес чужого служения, который лидер мог бы получить ссылкой.
  await openSection(page, 'Служения', 'Служения')
  const youthHref = await page.getByRole('link', { name: 'Молодёжное', exact: true }).getAttribute('href')
  expect(youthHref, 'ссылка на служение «Молодёжное»').toMatch(/^\/ministries\/[^/]+$/)

  // Администратор добавляет человека в «Прославление» и делает лидером.
  await openMembersFromNav(page, 'Прославление')
  await addMember(page, leader.lastName, fullName(leader))
  const leaderRow = memberRow(page, fullName(leader))
  await expect(leaderRow.locator('.member-row__roles')).toHaveText('Участник')
  await leaderRow.getByTestId('open-member').click()
  const memberDialog = page.getByRole('dialog', { name: 'Участник служения', exact: true })
  await expect(memberDialog.getByLabel('Участник', { exact: true })).toBeChecked()
  await memberDialog.getByLabel('Лидер', { exact: true }).check()
  const rolesSaved = page.waitForResponse(response => response.request().method() === 'PUT'
    && new URL(response.url()).pathname.startsWith(`/api/v1${new URL(page.url()).pathname}/`)
    && new URL(response.url()).pathname.endsWith('/roles'))
  await memberDialog.getByRole('button', { name: 'Сохранить роли' }).click()
  expect((await rolesSaved).status()).toBe(200)
  await expect(memberDialog.getByLabel('Участник', { exact: true })).toBeChecked()
  await memberDialog.getByTestId('close-member').click()
  await expect.poll(async () => (await leaderRow.locator('.member-row__roles').innerText()).split(' · ').sort()).toEqual(['Лидер', 'Участник'].sort())

  // Права лидера пересчитывает слушатель в очереди (MemberAdded и
  // MemberRolesChanged → BumpMembershipPermissionCache), а экран читает их
  // при загрузке приложения. Как и настоящий человек, лидер обновляет
  // страницу, пока воркер не обработает задания: сначала в навигации
  // появляются «Служения», затем в составе — кнопка управления.
  await expect(async () => {
    await reloadAuthenticated(leaderPhone)
    await mainNav(leaderPhone).getByRole('button', { name: 'Ещё', exact: true }).click()
    const more = leaderPhone.getByRole('dialog', { name: 'Ещё', exact: true })
    await expect(more.getByRole('link', { name: 'Служения', exact: true })).toBeVisible({ timeout: 2_000 })
    await more.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(mainNav(leaderPhone).getByRole('button', { name: 'Ещё', exact: true })).toBeFocused()
  }).toPass({ timeout: 30_000 })

  // В своём списке служений у лидера только его служение.
  await openSection(leaderPhone, 'Служения', 'Служения')
  await expect(leaderPhone.getByRole('link', { name: 'Прославление', exact: true })).toBeVisible()
  await expect(leaderPhone.getByRole('link', { name: 'Молодёжное', exact: true })).toHaveCount(0)

  await openMembersFromNav(leaderPhone, 'Прославление')
  const addButton = leaderPhone.getByRole('button', { name: 'Добавить участника' })
  await expect(async () => {
    await reloadAuthenticated(leaderPhone)
    await expect(addButton).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Лидер сам добавляет человека в своё служение.
  await addMember(leaderPhone, newcomer.lastName, fullName(newcomer))
  await expect(memberRow(leaderPhone, fullName(newcomer))).toBeVisible()
  await expectNoHorizontalScroll(leaderPhone, 'состав служения')

  // Лидер правит роль своего служения с телефона: список ролей и редактор
  // встают друг под другом и помещаются в экран.
  const description = 'Все, кто служит в прославлении'
  const tabs = leaderPhone.getByRole('navigation', { name: 'Разделы служения' })
  const ministryPath = new URL(leaderPhone.url()).pathname.replace(/\/members$/, '')
  await Promise.all([
    expectApiResponse(leaderPhone, 'GET', ministryPath, 200),
    expectApiResponse(leaderPhone, 'GET', `${ministryPath}/roles`, 200),
    tabs.getByRole('link', { name: 'Роли' }).click(),
  ])
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Роли служения' })).toBeVisible()
  await Promise.all([expectApiResponse(leaderPhone, 'GET', '/permissions', 200), leaderPhone.getByRole('button', { name: 'Участник', exact: true }).click()])
  await leaderPhone.getByRole('textbox', { name: 'Описание', exact: true }).fill(description)
  await expectNoHorizontalScroll(leaderPhone, 'редактор роли служения')
  // Экран редактора не пишет «Сохранено», поэтому ждём ответ на правку роли,
  // прежде чем перезагрузить страницу.
  const saved = leaderPhone.waitForResponse(response => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname.startsWith('/api/v1/roles/'))
  await leaderPhone.getByRole('button', { name: 'Сохранить', exact: true }).click()
  expect((await saved).status(), 'роль сохранена').toBe(200)
  // Правка сохранена на сервере: после перезагрузки описание на месте.
  await reloadAuthenticated(leaderPhone)
  await Promise.all([expectApiResponse(leaderPhone, 'GET', '/permissions', 200), leaderPhone.getByRole('button', { name: 'Участник', exact: true }).click()])
  await expect(leaderPhone.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(description)
  await Promise.all([
    expectApiResponse(leaderPhone, 'GET', `${ministryPath}/members`, 200),
    expectApiResponse(leaderPhone, 'GET', `${ministryPath}/roles`, 200),
    tabs.getByRole('link', { name: 'Участники' }).click(),
  ])
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()

  // Состав чужого служения по прямой ссылке закрыт, и управлять им нечем.
  await Promise.all([
    expectApiResponse(leaderPhone, 'GET', `${youthHref}/members`, 403),
    visitAuthenticated(leaderPhone, `${youthHref}/members`),
  ])
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
  await expect(leaderPhone.getByRole('alert')).toContainText('Нет права на это действие.')
  await expect(addButton).toHaveCount(0)
})
