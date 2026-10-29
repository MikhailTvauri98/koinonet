import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlatform } from '~/composables/usePlatform'

afterEach(() => vi.unstubAllGlobals())
describe('shared installed app detection', () => {
  it('recognizes iPhone Safari outside standalone', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone Version/17.0 Safari' })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(usePlatform()).toEqual({ isIos: true, isIosSafari: true, isStandalone: false })
  })
  it('recognizes iPadOS desktop user agents and the legacy standalone flag', () => {
    vi.stubGlobal('navigator', { userAgent: 'Macintosh Version/17.0 Safari', maxTouchPoints: 5, standalone: true })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(usePlatform()).toEqual({ isIos: true, isIosSafari: true, isStandalone: true })
  })
  it('does not show Safari-specific install directions for other iOS browsers', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone CriOS Safari' })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(usePlatform().isIosSafari).toBe(false)
  })
  it('recognizes standalone display mode on Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Android Chrome' })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(usePlatform()).toEqual({ isIos: false, isIosSafari: false, isStandalone: true })
  })
})
