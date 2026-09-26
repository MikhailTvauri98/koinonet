import { credentials } from './environment'
import {
  acceptInvite, createGlobalRole, createPerson, expect, expectPhoneTabBar, grantGlobalRole, login, loginAsAdmin,
  mainNav, openPersonCard, openSection, takeInviteLink, test,
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

  // Приглашённый — на телефоне: навигация там — нижняя панель вкладок.
  const phone = await openPhone()
  await acceptInvite(phone, link, petrov)
  await expectPhoneTabBar(phone)
  // Новый аккаунт получил ровно то, что даёт роль: справочник, но не
  // служения и не администрирование.
  await expect(mainNav(phone).getByRole('link', { name: 'Люди', exact: true })).toBeVisible()
  await expect(mainNav(phone).getByRole('link', { name: 'Служения', exact: true })).toHaveCount(0)
  await expect(phone.getByTestId('nav-admin')).toHaveCount(0)
  await openSection(phone, 'Люди', 'Люди')
  await expect(phone.getByRole('list', { name: 'Список людей' }).getByRole('link', { name: 'Петров Пётр' })).toBeVisible()
  // Администрирование закрыто и по прямому адресу.
  await phone.goto('/admin/roles')
  await expect(phone.getByRole('alert')).toHaveText('Нет права на управление глобальными ролями.')

  // Карточка у администратора: аккаунт создан, второе приглашение невозможно.
  await page.reload()
  await expect(page.getByText('Аккаунт включён.')).toBeVisible()
  await expect(invite).toBeDisabled()
  await expect(page.getByText('У человека уже есть аккаунт.')).toBeVisible()

  // Обычный вход тем же аккаунтом со второго телефона, и оттуда же —
  // завершение остальных устройств.
  const anotherPhone = await openPhone()
  await login(anotherPhone, petrov.login, credentials.invitedPassword)
  await openSection(anotherPhone, 'Профиль', 'Профиль')
  await anotherPhone.getByRole('navigation', { name: 'Разделы настроек' }).getByRole('link', { name: 'Устройства' }).click()
  await expect(anotherPhone.getByRole('heading', { level: 1, name: 'Устройства' })).toBeVisible()
  await expect(anotherPhone.getByRole('button', { name: 'Завершить', exact: true })).toHaveCount(2)
  await anotherPhone.getByRole('button', { name: 'Завершить остальные устройства' }).click()
  await expect(anotherPhone.getByRole('button', { name: 'Завершить', exact: true })).toHaveCount(1)
  await expect(anotherPhone.getByText('(текущее устройство)')).toBeVisible()

  // Сессия первого телефона завершена на сервере: следующий переход в
  // интерфейсе ведёт на экран входа, а не оставляет экран с ошибкой.
  await openSection(phone, 'Люди', 'Вход')
  await expect(phone).toHaveURL('/login')
})
