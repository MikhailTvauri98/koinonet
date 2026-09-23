// @vitest-environment nuxt
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hasVisibleMinistries, permissionChecker, useCan } from '~/composables/useCan'
import { useAuthStore } from '~/stores/auth'

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

describe('hasVisibleMinistries', () => {
  it('is true for a holder of ministries.view_all, without any personal membership', () => {
    expect(hasVisibleMinistries({ administrator: false, global: ['ministries.view_all'], ministries: {} })).toBe(true)
  })

  it('is true for a holder of ministries.manage_all, without any personal membership', () => {
    expect(hasVisibleMinistries({ administrator: false, global: ['ministries.manage_all'], ministries: {} })).toBe(true)
  })

  it('is true for plain personal membership, without either global permission', () => {
    expect(hasVisibleMinistries({ administrator: false, global: [], ministries: { m1: [] } })).toBe(true)
  })

  it('is false with neither global permission nor any personal membership', () => {
    expect(hasVisibleMinistries({ administrator: false, global: [], ministries: {} })).toBe(false)
  })

  it('is true for an administrator even without personal membership', () => {
    expect(hasVisibleMinistries({ administrator: true, global: [], ministries: {} })).toBe(true)
  })
})

describe('useCan', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reflects permissions that change in the store after useCan() was created', () => {
    const auth = useAuthStore()
    // AppNav и страницы живут в постоянном макете и вызывают useCan() один раз
    // в setup — can/canIn должны читать актуальный стор при каждом вызове, а не
    // закрываться над правами на момент создания (docs/architecture.md:585).
    const { can } = useCan()

    expect(can('people.view')).toBe(false)

    auth.permissions = { administrator: false, global: ['people.view'], ministries: {} }

    expect(can('people.view')).toBe(true)
  })
})
