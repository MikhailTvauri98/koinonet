// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { useAuthStore } from '~/stores/auth'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginSettingsPage from '~/pages/settings/login.vue'

// Половина экрана «Вход», которую бриф profile.spec.ts не покрывает: форма
// смены пароля (текущий, новый, повтор) и самопроверка про завершение
// остальных сессий после смены пароля (docs/architecture.md, раздел 7.2).
const patch = vi.fn()

mockNuxtImport('useApi', () => () => ({ patch }))

beforeEach(() => {
  patch.mockReset()
  setActivePinia(createPinia())
})

describe('password settings form', () => {
  it('catches a mismatched repeat on the client, before any request', async () => {
    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('oldpassword')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword2')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).not.toHaveBeenCalled()
    expect(page.find('[data-test="password-error"]').text()).toContain('не совпадают')
  })

  it('sends the current and new password together', async () => {
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('oldpassword')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword1')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/password', {
      current_password: 'oldpassword',
      password: 'newpassword1',
      password_confirmation: 'newpassword1',
    })
  })

  it('explains a wrong current password next to the field', async () => {
    patch.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'auth.invalid_password', message: 'Неверный текущий пароль.' },
    }))

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('wrong')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword1')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="password-error"]').text()).toContain('Неверный текущий пароль')
  })

  // Самопроверка брифа: что видит человек после смены пароля — сервер
  // завершает остальные сессии и токены «запомнить меня» (раздел 7.2), но
  // не выходит из текущей, поэтому экран остаётся на месте с уведомлением,
  // а не редиректом на /login.
  it('notices that other devices were logged out after a successful change', async () => {
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('oldpassword')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword1')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="password-changed"]').text()).toContain('Остальные устройства вышли')
  })

  it('clears the password fields after a successful change', async () => {
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('oldpassword')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword1')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect((page.get('[data-test="password-current"]').element as HTMLInputElement).value).toBe('')
    expect((page.get('[data-test="password-new"]').element as HTMLInputElement).value).toBe('')
  })

  it('asks to wait instead of showing the server text after too many attempts', async () => {
    patch.mockRejectedValue(Object.assign(new Error('failed'), { statusCode: 429, data: { message: 'Too Many Attempts.' } }))

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="password-current"]').setValue('oldpassword')
    await page.find('[data-test="password-new"]').setValue('newpassword1')
    await page.find('[data-test="password-confirmation"]').setValue('newpassword1')
    await page.find('[data-test="password-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="password-error"]').text()).toBe('Слишком много попыток. Подождите минуту.')
  })
})


it('keeps independent password confirmations and a confirmed login across permissions refresh', async () => {
  patch.mockResolvedValue({ data: {} })
  const page = await mountSuspended(LoginSettingsPage)
  const refresh = vi.spyOn(useAuthStore(), 'fetchMe').mockRejectedValue(new Error('refresh unavailable'))
  await page.get('[data-test=login]').setValue('new@example.test')
  await page.get('[data-test=login-current-password]').setValue('for-login')
  await page.get('[data-test=password-current]').setValue('for-password')
  await page.get('[data-test=login-form]').trigger('submit')
  await flushPromises()
  expect(patch).toHaveBeenCalledWith('/me/login', { login: 'new@example.test', current_password: 'for-login' })
  expect(page.get('[data-test=login-changed]').text()).toContain('Логин изменён')
  expect((page.get('[data-test=password-current]').element as HTMLInputElement).value).toBe('for-password')
  expect(page.find('[data-test=login-error]').exists()).toBe(false)
  refresh.mockRestore()
})


it('ignores security errors after same-account logout/relogin and keeps new input', async () => {
  let reject!: (reason: unknown) => void
  patch.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  const page = await mountSuspended(LoginSettingsPage)
  await page.get('[data-test=login-form]').trigger('submit')
  useAuthStore().sessionVersion++
  await flushPromises()
  await page.get('[data-test=login]').setValue('new-session@example.test')
  reject(new Error('old request failed'))
  await flushPromises()
  expect(page.find('[data-test=login-error]').exists()).toBe(false)
  expect((page.get('[data-test=login]').element as HTMLInputElement).value).toBe('new-session@example.test')
})

it('keeps the login caption stable while describing field errors separately', async () => {
  patch.mockRejectedValue({ statusCode: 422, data: { errors: { login: ['Этот логин уже занят.'] } } })
  const page = await mountSuspended(LoginSettingsPage)
  await page.get('[data-test=login-form]').trigger('submit')
  await flushPromises()
  const input = page.get('[data-test=login]')
  expect(input.attributes('aria-labelledby')).toBeTruthy()
  expect(page.get('#' + input.attributes('aria-labelledby')).text()).toBe('Новый логин (телефон или email)')
})


it('does not refresh authentication after an unmounted security form completes', async () => {
  let resolve!: (value: unknown) => void
  patch.mockImplementation(() => new Promise(done => { resolve = done }))
  const page = await mountSuspended(LoginSettingsPage)
  const refresh = vi.spyOn(useAuthStore(), 'fetchMe')
  await page.get('[data-test=login-form]').trigger('submit')
  page.unmount()
  resolve({ data: {} })
  await flushPromises()
  expect(refresh).not.toHaveBeenCalled()
  refresh.mockRestore()
})
