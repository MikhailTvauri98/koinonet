// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import MinistryMark from '~/components/ui/MinistryMark.vue'

const tint = (style: string | undefined) => /--tint-color:\s*([^;]+)/.exec(style ?? '')?.[1]?.trim()

describe('MinistryMark', () => {
  it('names the church with the neutral color for a church event', async () => {
    const mark = await mountSuspended(MinistryMark, { props: { ministry: null } })
    expect(mark.text()).toBe('Церковь')
    expect(tint(mark.attributes('style'))).toBe('var(--ui-ministry-church)')
  })

  it('shows the ministry name beside its color', async () => {
    const mark = await mountSuspended(MinistryMark, { props: { ministry: { id: 'm1', name: 'Детское служение', color: 'rose' } } })
    expect(mark.text()).toBe('Детское служение')
    expect(tint(mark.attributes('style'))).toBe('var(--ui-ministry-rose)')
  })

  it('keeps the name and uses the neutral color for a ministry without a known color', async () => {
    for (const color of [null, undefined, 'crimson']) {
      const mark = await mountSuspended(MinistryMark, { props: { ministry: { id: 'm1', name: 'Прославление', color } } })
      expect(mark.text()).toBe('Прославление')
      expect(tint(mark.attributes('style'))).toBe('var(--ui-ministry-church)')
    }
  })

  it('draws a decorative dot next to the visible name in the dot form', async () => {
    const mark = await mountSuspended(MinistryMark, { props: { ministry: { id: 'm1', name: 'Молодёжь', color: 'teal' }, variant: 'dot' } })
    expect(mark.classes()).toContain('ministry-mark--dot')
    expect(mark.get('.ministry-mark__dot').attributes('aria-hidden')).toBe('true')
    expect(mark.text()).toBe('Молодёжь')
    expect((await mountSuspended(MinistryMark, { props: { ministry: null } })).classes()).toContain('ministry-mark--tag')
  })
})
