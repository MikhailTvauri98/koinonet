// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { churchDateFormatter, useChurchDate } from '~/composables/useChurchDate'
import { useSettingsStore } from '~/stores/settings'

beforeEach(() => setActivePinia(createPinia()))

describe('church dates', () => {
  it('formats the church wall clock and calendar day', () => {
    const f = churchDateFormatter('Asia/Vladivostok')
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('11:30')
    expect(f.formatDate('2026-10-01T15:30:00Z')).toBe('2 окт. 2026 г.')
    expect(churchDateFormatter('Europe/Moscow').formatDateTime('2026-10-01T07:05:00Z')).toBe('1 окт. 2026 г., 10:05')
  })

  it('knows today across the international date line', () => {
    expect(churchDateFormatter('Pacific/Auckland', () => new Date('2026-10-01T11:30:00Z')).todayInChurch()).toBe('2026-10-02')
  })

  it('keeps existing formatter methods reactive to loaded or changed settings', () => {
    const f = useChurchDate()
    const settings = useSettingsStore()
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('01:30')
    settings.timezone = 'Asia/Vladivostok'
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('11:30')
  })
})
