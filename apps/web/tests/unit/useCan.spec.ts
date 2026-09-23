import { describe, expect, it } from 'vitest'
import { permissionChecker } from '~/composables/useCan'

describe('permissionChecker', () => {
  const admin = { administrator: true, global: [], ministries: {} }
  const plain = { administrator: false, global: ['people.view'], ministries: { m1: ['members.manage'] } }

  it('lets an administrator do anything', () => {
    const { can, canIn } = permissionChecker(admin)
    expect(can('settings.manage')).toBe(true)
    expect(canIn('any', 'members.manage')).toBe(true)
  })

  it('checks a global permission', () => {
    const { can } = permissionChecker(plain)
    expect(can('people.view')).toBe(true)
    expect(can('people.manage')).toBe(false)
  })

  it('scopes ministry permissions to their ministry', () => {
    const { canIn } = permissionChecker(plain)
    expect(canIn('m1', 'members.manage')).toBe(true)
    expect(canIn('m2', 'members.manage')).toBe(false)
  })

  it('lets ministries.manage_all cover every ministry', () => {
    const { canIn } = permissionChecker({ administrator: false, global: ['ministries.manage_all'], ministries: {} })
    expect(canIn('m9', 'roles.manage')).toBe(true)
  })
})
