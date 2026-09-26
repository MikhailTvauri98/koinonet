import { credentials } from './environment'
import {
  acceptInvite, createGlobalRole, createPerson, expect, grantGlobalRole, login, loginAsAdmin,
  openPersonCard, takeInviteLink, test,
} from './fixtures'

// Сценарий фазы 1 (docs/architecture.md, раздел 13): администратор после
// установки создаёт роль и человека, приглашает его, и человек входит с
// телефона. Имена данных — свои у каждого файла сценариев, поэтому сценарии
// не зависят друг от друга и от порядка запуска.

const petrov = { lastName: 'Петров', firstName: 'Пётр', login: 'petrov@e2e.test' }

test('an administrator installs, creates a role, a person and invites them', async ({ page, openPhone }) => {
  await loginAsAdmin(page)

  await createGlobalRole(page, 'Служитель', ['Видеть справочник'])
  await createPerson(page, petrov)
  await openPersonCard(page, petrov)

  // Инвариант 6.3.3: без глобальной роли приглашение недоступно, и экран
  // объясняет почему.
  const invite = page.getByRole('button', { name: 'Пригласить' })
  await expect(invite).toBeDisabled()
  await expect(page.getByText('Сначала выдайте глобальную роль.')).toBeVisible()

  await grantGlobalRole(page, 'Служитель')
  await expect(invite).toBeEnabled()
  await expect(page.getByText('Сначала выдайте глобальную роль.')).toBeHidden()
  const link = await takeInviteLink(page)

  const phone = await openPhone()
  await acceptInvite(phone, link, petrov)
  // Новый аккаунт получил ровно то, что даёт роль: справочник, но не
  // служения и не администрирование.
  await expect(phone.getByRole('link', { name: 'Справочник' })).toBeVisible()
  await expect(phone.getByRole('link', { name: 'Служения' })).toHaveCount(0)
  await phone.goto('/admin/roles')
  await expect(phone.getByRole('alert')).toHaveText('Нет права на управление глобальными ролями.')

  // Карточка у администратора: аккаунт создан, второе приглашение невозможно.
  await page.reload()
  await expect(page.getByText('Аккаунт включён.')).toBeVisible()
  await expect(invite).toBeDisabled()
  await expect(page.getByText('У человека уже есть аккаунт.')).toBeVisible()

  // Обычный вход тем же аккаунтом с другого телефона.
  const anotherPhone = await openPhone()
  await login(anotherPhone, petrov.login, credentials.invitedPassword)
  await expect(anotherPhone.getByRole('heading', { level: 1, name: `Здравствуйте, ${petrov.firstName}!` })).toBeVisible()
})
