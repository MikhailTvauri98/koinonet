// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import UiAvatar from '~/components/ui/UiAvatar.vue'
import { MINISTRY_COLORS } from '~/utils/ministryColor'

const tint = (style: string | undefined) => /--tint-color:\s*([^;]+)/.exec(style ?? '')?.[1]?.trim()
const avatar = (props: { id: string, name: string | null, photoUrl?: string | null, size?: 'sm' | 'md' | 'lg' }) => mountSuspended(UiAvatar, { props })

describe('UiAvatar', () => {
  it('hides a decorative avatar from assistive technology and keeps the default image role otherwise', async () => {
    const decorative = await mountSuspended(UiAvatar, { props: { id: 'p1', name: 'Анна Петрова', decorative: true } })
    expect(decorative.attributes('aria-hidden')).toBe('true'); expect(decorative.attributes('role')).toBeUndefined(); expect(decorative.attributes('aria-label')).toBeUndefined()
    const plain = await avatar({ id: 'p1', name: 'Анна Петрова' })
    expect(plain.attributes('role')).toBe('img'); expect(plain.attributes('aria-label')).toBe('Анна Петрова'); expect(plain.attributes('aria-hidden')).toBeUndefined()
  })
  it('gives the same person the same palette color and different people different colors', async () => {
    const first = await avatar({ id: '01JCPERSON0000000000000001', name: 'Мария Кузнецова' })
    const again = await avatar({ id: '01JCPERSON0000000000000001', name: 'Мария Кузнецова', size: 'lg' })
    expect(tint(first.attributes('style'))).toBeDefined()
    expect(tint(again.attributes('style'))).toBe(tint(first.attributes('style')))
    const palette = MINISTRY_COLORS.map(color => `var(--ui-ministry-${color.key})`)
    const colors = new Set<string | undefined>()
    for (let index = 0; index < 24; index++) {
      const wrapper = await avatar({ id: `01JCPERSON${String(index).padStart(16, '0')}`, name: 'Дмитрий Смирнов' })
      colors.add(tint(wrapper.attributes('style')))
    }
    expect([...colors].every(color => palette.includes(color!))).toBe(true)
    expect(colors.size).toBeGreaterThan(1)
  })

  it.each([
    ['Мария Кузнецова', 'МК'],
    ['  мария   кузнецова  ', 'МК'],
    ['Мария', 'М'],
    ['Кузнецова Мария Игоревна', 'КМ'],
  ])('shows initials of %j as %j and names the person', async (name, initials) => {
    const wrapper = await avatar({ id: 'p1', name })
    expect(wrapper.text()).toBe(initials)
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe(name.trim().replace(/\s+/g, ' '))
  })

  it('shows a neutral question mark and the accessible name «Участник» when the name is hidden', async () => {
    const wrapper = await avatar({ id: '01JCPERSON0000000000000001', name: null })
    expect(wrapper.text()).toBe('?')
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Участник')
    expect(tint(wrapper.attributes('style'))).toBe('var(--ui-ministry-church)')
  })

  it('shows the photo instead of initials and falls back to initials when the photo fails', async () => {
    const wrapper = await avatar({ id: 'p1', name: 'Мария Кузнецова', photoUrl: '/media/p1-thumb.jpg' })
    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe('/media/p1-thumb.jpg')
    expect(image.attributes('alt')).toBe('')
    expect(wrapper.text()).toBe('')
    expect(wrapper.attributes('aria-label')).toBe('Мария Кузнецова')
    await image.trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('МК')
    await wrapper.setProps({ photoUrl: '/media/p1-new.jpg' })
    expect(wrapper.get('img').attributes('src')).toBe('/media/p1-new.jpg')
  })

  it('shows initials when the API gave no photo and applies the requested size', async () => {
    const wrapper = await avatar({ id: 'p1', name: 'Мария Кузнецова', photoUrl: null, size: 'sm' })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.classes()).toContain('ui-avatar--sm')
    expect((await avatar({ id: 'p1', name: 'Мария Кузнецова' })).classes()).toContain('ui-avatar--md')
  })
})
