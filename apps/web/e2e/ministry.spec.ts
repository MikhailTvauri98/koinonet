import type { Page } from '@playwright/test'
import {
  createGlobalRole, createInvitedAccount, createMinistry, createPerson, expect, fullName, loginAsAdmin, test,
} from './fixtures'

// Лидер управляет составом своего служения и не может управлять чужим.
// Имена данных — свои у каждого файла сценариев, поэтому сценарии не
// зависят друг от друга и от порядка запуска.

const leader = { lastName: 'Сидоров', firstName: 'Сергей', login: 'sidorov@e2e.test', globalRole: 'Прихожанин' }
const newcomer = { lastName: 'Кузнецова', firstName: 'Анна' }

async function ministryId(page: Page, name: string): Promise<string> {
  await page.goto('/ministries')
  const href = await page.getByRole('link', { name }).getAttribute('href')
  const id = href?.match(/^\/ministries\/([^/]+)$/)?.[1]
  expect(id, `ссылка на служение «${name}»: ${href}`).toBeTruthy()
  return id!
}

async function openMembers(page: Page, id: string): Promise<void> {
  await page.goto(`/ministries/${id}/members`)
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

  const praiseId = await ministryId(page, 'Прославление')
  const youthId = await ministryId(page, 'Молодёжное')

  // Администратор добавляет человека в «Прославление» и делает лидером.
  await page.getByRole('link', { name: 'Прославление' }).click()
  await page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'Участники' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Участники' })).toBeVisible()
  await addMember(page, leader.lastName, fullName(leader))
  const leaderRow = memberRow(page, fullName(leader))
  await expect(leaderRow.getByRole('list', { name: 'Роли участника', exact: true })).toHaveText('Участник')
  await leaderRow.getByLabel('Лидер', { exact: true }).check()
  await leaderRow.getByRole('button', { name: 'Сохранить роли' }).click()
  await expect(leaderRow.getByRole('list', { name: 'Роли участника', exact: true }).getByText('Лидер', { exact: true })).toBeVisible()

  // Права лидера пересчитывает слушатель в очереди (MemberAdded и
  // MemberRolesChanged → BumpMembershipPermissionCache), а экран читает их
  // при загрузке приложения. Как и настоящий человек, лидер увидит кнопку
  // после того, как воркер обработает задания, — поэтому страница
  // перезагружается, пока кнопка не появится.
  const addButton = leaderPhone.getByRole('button', { name: 'Добавить участника' })
  await expect(async () => {
    await openMembers(leaderPhone, praiseId)
    expect(await addButton.isVisible()).toBe(true)
  }).toPass({ timeout: 30_000 })

  // Лидер сам добавляет человека в своё служение.
  await addMember(leaderPhone, newcomer.lastName, fullName(newcomer))
  await expect(memberRow(leaderPhone, fullName(newcomer))).toBeVisible()

  // В чужом служении состав закрыт, и управлять им нечем.
  await openMembers(leaderPhone, youthId)
  await expect(leaderPhone.getByRole('alert')).toContainText('Нет права на это действие.')
  await expect(addButton).toHaveCount(0)
})
