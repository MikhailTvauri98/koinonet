// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { isPublicPath } from '~/middleware/auth.global'

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
