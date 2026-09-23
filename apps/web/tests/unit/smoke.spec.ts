import { describe, expect, it } from 'vitest'
import type { paths } from '~~/types/api'

describe('generated api types', () => {
  it('describes the health endpoint', () => {
    const path: keyof paths = '/health'
    expect(path).toBe('/health')
  })
})
