// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSettings from '~/pages/admin/settings.vue'
import { grantPermissions } from '../support/permissions'

const get = vi.fn()
const put = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, put }))

const settings = { church_name: 'Дом хлеба', timezone: 'Europe/Moscow', phone_region: 'RU' }

// Смонтированный экран прошлого теста живёт дальше и реагирует на права,
// которые следующий тест пишет в тот же стор, — поэтому экраны снимаются
// после каждого теста.
enableAutoUnmount(afterEach)

beforeEach(() => {
  [get, put].forEach(fn => fn.mockReset())
  grantPermissions()
  get.mockResolvedValue({ data: { ...settings } })
  put.mockResolvedValue({ data: { ...settings } })
})

describe('admin church settings page', () => {
  it('hides the form without settings.manage', async () => {
    const page = await mountSuspended(AdminSettings)

    expect(page.text()).toContain('Нет права')
    expect(page.find('[data-test="church-name"]').exists()).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })

  it('loads the current name, timezone and phone region with settings.manage', async () => {
    grantPermissions({ global: ['settings.manage'] })

    const page = await mountSuspended(AdminSettings)
    await flushPromises()

    expect((page.get('[data-test="church-name"]').element as HTMLInputElement).value).toBe('Дом хлеба')
    expect((page.get('[data-test="timezone"]').element as HTMLInputElement).value).toBe('Europe/Moscow')
    expect((page.get('[data-test="phone-region"]').element as HTMLInputElement).value).toBe('RU')
  })

  it('saves the edited settings', async () => {
    grantPermissions({ global: ['settings.manage'] })

    const page = await mountSuspended(AdminSettings)
    await flushPromises()
    await page.find('[data-test="church-name"]').setValue('Церковь на Мира')
    await page.find('[data-test="timezone"]').setValue('Asia/Yekaterinburg')
    await page.find('[data-test="phone-region"]').setValue('kz')
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(put).toHaveBeenCalledWith('/settings', {
      church_name: 'Церковь на Мира',
      timezone: 'Asia/Yekaterinburg',
      phone_region: 'KZ',
    })
    expect(page.text()).toContain('Сохранено')
  })

  it('shows a validation error next to the field', async () => {
    grantPermissions({ global: ['settings.manage'] })
    put.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { message: 'Ошибка валидации.', errors: { timezone: ['Часовой пояс не найден.'] } },
    }))

    const page = await mountSuspended(AdminSettings)
    await flushPromises()
    await page.find('[data-test="timezone"]').setValue('Mars/Olympus')
    await page.find('form').trigger('submit')
    await flushPromises()

    expect(page.text()).toContain('Часовой пояс не найден')
  })
})
