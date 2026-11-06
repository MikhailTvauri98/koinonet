// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppearancePage from '~/pages/settings/appearance.vue'
import { useTheme } from '~/composables/useTheme'

beforeEach(() => { useTheme().setTheme('dark'); localStorage.clear(); vi.restoreAllMocks() })

describe('device appearance settings', () => {
  it('selects dark by default and changes the real shared theme immediately', async () => {
    const page = await mountSuspended(AppearancePage)
    expect((page.get('input[value=dark]').element as HTMLInputElement).checked).toBe(true)
    await page.get('input[value=light]').setValue(true)
    expect(useTheme().theme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('church.ui.theme')).toBe('light')
    await page.get('input[value=dark]').setValue(true)
    expect(useTheme().theme.value).toBe('dark')
  })

  it('can switch the visible page when device storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const page = await mountSuspended(AppearancePage)
    await page.get('input[value=light]').setValue(true)
    expect(useTheme().theme.value).toBe('light')
    expect(page.get('input[value=light]').attributes('aria-describedby')).toBe('appearance-device-hint')
  })
})
