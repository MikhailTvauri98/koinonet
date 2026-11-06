// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import FormSection from '~/components/ui/FormSection.vue'

describe('FormSection', () => {
  it('names its region and preserves native fieldsets, labels and controls', async () => {
    const section = await mountSuspended(FormSection, {
      props: { title: 'Видимость и уведомление', description: 'Выберите, кто увидит событие.' },
      slots: { default: '<fieldset><legend>Видимость</legend><label><input type="radio" name="visibility" value="church">Вся церковь</label><label>Служение<select><option>Музыкальное служение</option></select></label></fieldset>' },
    })
    const heading = section.get('h2')
    expect(section.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'))
    expect(heading.text()).toBe('Видимость и уведомление')
    expect(section.get('p').text()).toBe('Выберите, кто увидит событие.')
    await section.get('input').setValue()
    expect((section.get('input').element as HTMLInputElement).checked).toBe(true)
    expect(section.get('fieldset legend').text()).toBe('Видимость')
    expect(section.get('select').element.value).toBe('Музыкальное служение')
  })

  it('does not render an empty description and gives repeated sections distinct names', async () => {
    const form = await mountSuspended(defineComponent({ render: () => h('form', [h(FormSection, { title: 'О событии' }), h(FormSection, { title: 'Дата и время' })]) }))
    expect(form.find('p').exists()).toBe(false)
    const headings = form.findAll('h2')
    expect(headings[0]!.attributes('id')).not.toBe(headings[1]!.attributes('id'))
  })
})
