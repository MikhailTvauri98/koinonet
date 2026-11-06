// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'
import SlotEditor from '~/components/calendar/SlotEditor.vue'
const choices = [{ id: 'a', name: 'Первое', roles: [{ id: 'ra', name: 'Роль A' }] }, { id: 'b', name: 'Второе', roles: [{ id: 'rb', name: 'Роль B' }] }]
it('single mode has no list add/remove controls', async () => {
  const w = await mountSuspended(SlotEditor, { props: { modelValue: [{ role_id: null, label: 'Слот', required_count: 1 }], choices, single: true } })
  expect(w.find('[data-test="add-slot"]').exists()).toBe(false)
  expect(w.findAll('button').some(b => b.text() === 'Убрать слот')).toBe(false)
})
it('derives selected ministry from the remaining role after row removal or edited-slot switch', async () => {
  const a = { role_id: 'ra', label: null, required_count: 1 }, b = { role_id: 'rb', label: null, required_count: 1 }
  const w = await mountSuspended(SlotEditor, { props: { modelValue: [a, b], choices } })
  await w.findAll('select')[0]!.setValue('a')
  await w.setProps({ modelValue: [b] })
  expect((w.findAll('select')[0]!.element as HTMLSelectElement).value).toBe('b')
  expect(w.get('[data-test="slot-0-role"]').text()).toContain('Роль B')
})
it('connects field errors to native slot fields and preserves valid values', async () => {
  const w = await mountSuspended(SlotEditor, { props: { modelValue: [{ role_id: null, label: 'Помощь', required_count: 0 }], choices, fieldErrors: { 'slots.0.required_count': ['Количество — от 1 до 50.'] } } })
  const field = w.get('[data-test="slot-0-count"]')
  expect(field.attributes('aria-invalid')).toBe('true')
  expect(w.get(`[id="${field.attributes('aria-describedby')}"]`).text()).toBe('Количество — от 1 до 50.')
  expect(w.get('[data-test="slot-0-label"]').element).toHaveProperty('value', 'Помощь')
})
