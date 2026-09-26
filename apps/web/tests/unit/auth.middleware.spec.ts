// @vitest-environment nuxt
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import authMiddleware, { isPublicPath } from '~/middleware/auth.global'
import { useAuthStore } from '~/stores/auth'

const get = vi.fn()
const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))

mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('navigateTo', () => navigateToMock)

beforeEach(() => {
  setActivePinia(createPinia())
  get.mockReset()
  navigateToMock.mockReset()
})

function to(path: string): RouteLocationNormalized {
  return { path } as RouteLocationNormalized
}

describe('auth middleware', () => {
  it('sends a guest to the login screen after the server answers 401', async () => {
    get.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))

    await authMiddleware(to('/people'), to('/'))

    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('does not send anyone to the login screen when the server did not answer', async () => {
    get.mockRejectedValue(new TypeError('Failed to fetch'))

    await authMiddleware(to('/people'), to('/'))

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(useAuthStore().connectionLost).toBe(true)
  })
})


describe('isPublicPath', () => {
  it('treats the login screen as public', () => {
    expect(isPublicPath('/login')).toBe(true)
  })

  it('treats invitation links as public', () => {
    expect(isPublicPath('/invite/tok123')).toBe(true)
  })

  it('treats password-reset links as public', () => {
    expect(isPublicPath('/password-reset/tok123')).toBe(true)
  })

  it('treats everything else as private', () => {
    expect(isPublicPath('/')).toBe(false)
    expect(isPublicPath('/people')).toBe(false)
    expect(isPublicPath('/password-reset')).toBe(false)
  })
})
