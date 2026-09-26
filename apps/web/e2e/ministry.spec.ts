import type { Page } from '@playwright/test'
import {
  createGlobalRole, createInvitedAccount, createMinistry, createPerson, expect, expectNoHorizontalScroll, fullName,
  loginAsAdmin, mainNav, openSection, test,
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
  await page.getByRole('link', { name: ministry }).click()
  await expect(page.getByRole('heading', { level: 1, name: ministry })).toBeVisible()
  await page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'Участники' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
}

async function addMember(page: Page, lastName: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Добавить участника' }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить участника' })
  await dialog.getByLabel('Поиск по имени и фамилии').fill(lastName)
  await dialog.getByRole('button', { name }).click()
  await expect(dialog).toBeHidden()
}

function memberRow(page: Page, name: string) {
  return page.getByTestId('member-row').filter({ hasText: name })
}

test('a leader manages members of their own ministry only', async ({ page, openPhone }) => {
  await loginAsAdmin(page)

  // Глобальная роль приглашённого даёт справочник, но не права служений.
  await createGlobalRole(page, leader.globalRole, ['Видеть справочник'])
  await createMinistry(page, 'Прославление')
  await createMinistry(page, 'Молодёжное')
  await createPerson(page, newcomer)
  const leaderPhone = await createInvitedAccount(page, openPhone, leader)

  // Адрес чужого служения, который лидер мог бы получить ссылкой.
  await openSection(page, 'Служения', 'Служения')
  const youthHref = await page.getByRole('link', { name: 'Молодёжное' }).getAttribute('href')
  expect(youthHref, 'ссылка на служение «Молодёжное»').toMatch(/^\/ministries\/[^/]+$/)

  // Администратор добавляет человека в «Прославление» и делает лидером.
  await openMembersFromNav(page, 'Прославление')
  await addMember(page, leader.lastName, fullName(leader))
  const leaderRow = memberRow(page, fullName(leader))
  await expect(leaderRow.getByRole('list', { name: 'Роли участника', exact: true })).toHaveText('Участник')
  await leaderRow.getByLabel('Лидер', { exact: true }).check()
  await leaderRow.getByRole('button', { name: 'Сохранить роли' }).click()
  await expect(leaderRow.getByRole('list', { name: 'Роли участника', exact: true }).getByText('Лидер', { exact: true })).toBeVisible()

  // Права лидера пересчитывает слушатель в очереди (MemberAdded и
  // MemberRolesChanged → BumpMembershipPermissionCache), а экран читает их
  // при загрузке приложения. Как и настоящий человек, лидер обновляет
  // страницу, пока воркер не обработает задания: сначала в навигации
  // появляются «Служения», затем в составе — кнопка управления.
  const ministriesTab = mainNav(leaderPhone).getByRole('link', { name: 'Служения', exact: true })
  await expect(async () => {
    await leaderPhone.reload()
    await expect(ministriesTab).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // В своём списке служений у лидера только его служение.
  await openSection(leaderPhone, 'Служения', 'Служения')
  await expect(leaderPhone.getByRole('link', { name: 'Прославление' })).toBeVisible()
  await expect(leaderPhone.getByRole('link', { name: 'Молодёжное' })).toHaveCount(0)

  await openMembersFromNav(leaderPhone, 'Прославление')
  const addButton = leaderPhone.getByRole('button', { name: 'Добавить участника' })
  await expect(async () => {
    await leaderPhone.reload()
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
  await tabs.getByRole('link', { name: 'Роли' }).click()
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Роли служения' })).toBeVisible()
  await leaderPhone.getByRole('button', { name: 'Участник', exact: true }).click()
  await leaderPhone.getByLabel('Описание').fill(description)
  await expectNoHorizontalScroll(leaderPhone, 'редактор роли служения')
  // Экран редактора не пишет «Сохранено», поэтому ждём ответ на правку роли,
  // прежде чем перезагрузить страницу.
  const saved = leaderPhone.waitForResponse(response => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname.startsWith('/api/v1/roles/'))
  await leaderPhone.getByRole('button', { name: 'Сохранить', exact: true }).click()
  expect((await saved).status(), 'роль сохранена').toBe(200)
  // Правка сохранена на сервере: после перезагрузки описание на месте.
  await leaderPhone.reload()
  await leaderPhone.getByRole('button', { name: 'Участник', exact: true }).click()
  await expect(leaderPhone.getByLabel('Описание')).toHaveValue(description)
  await tabs.getByRole('link', { name: 'Участники' }).click()
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()

  // Состав чужого служения по прямой ссылке закрыт, и управлять им нечем.
  await leaderPhone.goto(`${youthHref}/members`)
  await expect(leaderPhone.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
  await expect(leaderPhone.getByRole('alert')).toContainText('Нет права на это действие.')
  await expect(addButton).toHaveCount(0)
})
