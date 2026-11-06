// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import PageHeader from '~/components/ui/PageHeader.vue'

describe('PageHeader', () => {
  it('renders the page title, optional description, breadcrumbs and actions in semantic order', async () => {
    const header = await mountSuspended(PageHeader, {
      props: { title: 'Музыкальное служение', description: 'Готовимся к событиям и служим вместе' },
      slots: { breadcrumbs: '<a href="/ministries">Служения</a>', actions: '<button>Добавить участника</button>' },
    })
    expect(header.get('h1').text()).toBe('Музыкальное служение')
    expect(header.get('p').text()).toBe('Готовимся к событиям и служим вместе')
    expect(header.get('nav[aria-label="Путь к странице"] a').attributes('href')).toBe('/ministries')
    expect(header.get('button').text()).toBe('Добавить участника')
    expect(header.text().indexOf('Служения')).toBeLessThan(header.text().indexOf('Музыкальное служение'))
  })
  it('does not leave empty description or slot containers for a title-only page', async () => {
    const header = await mountSuspended(PageHeader, { props: { title: 'Календарь' } })
    expect(header.findAll('h1')).toHaveLength(1)
    expect(header.find('p').exists()).toBe(false)
    expect(header.find('nav').exists()).toBe(false)
    expect(header.find('.page-header__actions').exists()).toBe(false)
  })
})
