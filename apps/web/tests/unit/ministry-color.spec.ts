import { describe, expect, it } from 'vitest'
import { MINISTRY_COLORS, colorKeyForId, ministryColorVar } from '~/utils/ministryColor'

describe('ministryColorVar', () => {
  it('uses the neutral church token for a church event and for a ministry without a color', () => {
    expect(ministryColorVar(null)).toBe('var(--ui-ministry-church)')
    expect(ministryColorVar({ color: null })).toBe('var(--ui-ministry-church)')
    expect(ministryColorVar({})).toBe('var(--ui-ministry-church)')
  })

  it('maps a catalog key to its token', () => {
    expect(ministryColorVar({ color: 'teal' })).toBe('var(--ui-ministry-teal)')
    for (const { key } of MINISTRY_COLORS) expect(ministryColorVar({ color: key })).toBe(`var(--ui-ministry-${key})`)
  })

  it.each(['crimson', '', 'church', 'TEAL', 'toString', 'teal); color: red'])('treats the unknown key %j as the church color', (color) => {
    expect(ministryColorVar({ color })).toBe('var(--ui-ministry-church)')
  })
})

describe('MINISTRY_COLORS', () => {
  it('lists the six catalog keys with Russian labels in the picker order', () => {
    expect(MINISTRY_COLORS).toEqual([
      { key: 'violet', label: 'Фиолетовый' },
      { key: 'teal', label: 'Бирюзовый' },
      { key: 'rose', label: 'Розовый' },
      { key: 'amber', label: 'Янтарный' },
      { key: 'sky', label: 'Голубой' },
      { key: 'green', label: 'Зелёный' },
    ])
  })
})

describe('colorKeyForId', () => {
  const ids = Array.from({ length: 60 }, (_, index) => `01JC${String(index).padStart(22, '0')}`)

  it('gives the same id the same catalog key every time', () => {
    for (const id of ids) expect(colorKeyForId(id)).toBe(colorKeyForId(id))
    expect(MINISTRY_COLORS.map(color => color.key)).toContain(colorKeyForId('01JCPERSON0000000000000001'))
  })

  it('spreads different people over all six hues', () => {
    expect(new Set(ids.map(colorKeyForId)).size).toBe(6)
  })
})
