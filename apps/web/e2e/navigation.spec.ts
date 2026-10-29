import { credentials } from './environment'
import { expect, expectApiResponse, expectNoHorizontalScroll, expectPhoneTabBar, loginAsAdmin, openSection, test } from './fixtures'

// Фаза 1 готова, когда администратор управляет системой с телефона
// (docs/architecture.md, раздел 13): все его разделы, включая
// администрирование, открываются из нижней панели вкладок, а не только
// вводом адреса, и ни один не шире узкого телефона (375 px). Данных сценарий
// не создаёт.

test('the administrator reaches every section from the phone tab bar', async ({ openPhone }) => {
  const phone = await openPhone()
  await phone.setViewportSize({ width: 375, height: 812 })
  await loginAsAdmin(phone)
  await expectPhoneTabBar(phone)

  const sections: [section: string, heading: string][] = [
    ['Люди', 'Люди'],
    ['Служения', 'Служения'],
    ['Профиль', 'Профиль'],
    ['Роли', 'Глобальные роли'],
    ['Настройки церкви', 'Настройки церкви'],
    ['Журнал', 'Журнал действий'],
    ['Главная', `Здравствуйте, ${credentials.admin.firstName}!`],
  ]
  for (const [section, heading] of sections) {
    await openSection(phone, section, heading)
    await expectPhoneTabBar(phone)
    await expectNoHorizontalScroll(phone, section)
  }

  // Редактор глобальной роли на узком экране встаёт под список ролей.
  await openSection(phone, 'Роли', 'Глобальные роли')
  await Promise.all([expectApiResponse(phone, 'GET', '/permissions', 200), phone.getByTestId('create-role').click()])
  await expect(phone.getByLabel('Название')).toBeVisible()
  await expectNoHorizontalScroll(phone, 'редактор глобальной роли')
})
