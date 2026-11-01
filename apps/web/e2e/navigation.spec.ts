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
    ['Календарь', 'Календарь'],
    ['Шаблоны', 'Шаблоны'],
    ['Объявления', 'Объявления'],
    ['Чаты', 'Чаты'],
    ['Уведомления', 'Уведомления'],
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
    if (section === 'Шаблоны') {
      for (const archived of [true, false]) {
        const response = phone.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/templates' && response.request().method() === 'GET')
        await phone.getByTestId('include-archived').setChecked(archived)
        const result = await response
        expect(new URL(result.url()).searchParams.get('archived')).toBe(archived ? '1' : '0')
        expect(result.status(), 'both template archive filter states obey the real API contract').toBe(200)
      }
    }
  }

  // Редактор глобальной роли на узком экране встаёт под список ролей.
  await openSection(phone, 'Роли', 'Глобальные роли')
  await Promise.all([expectApiResponse(phone, 'GET', '/permissions', 200), phone.getByTestId('create-role').click()])
  await expect(phone.getByRole('textbox', { name: 'Название', exact: true })).toBeVisible()
  await expectNoHorizontalScroll(phone, 'редактор глобальной роли')
})
