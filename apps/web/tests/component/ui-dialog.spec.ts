// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import UiDialog from '~/components/ui/UiDialog.vue'
import PasswordField from '~/components/PasswordField.vue'

enableAutoUnmount(afterEach)

describe('shared dialog content', () => {
  it('keeps the consumer heading and default content and places optional actions after it', async () => {
    const dialog = await mountSuspended(UiDialog, {
      props: { open: false, label: 'Изменить пароль' },
      slots: {
        default: '<h2>Изменить пароль</h2><form id="password-form"><label>Пароль<input type="password"></label></form>',
        actions: '<button form="password-form" type="submit">Сохранить</button><button type="button">Отмена</button>',
      },
    })
    expect(dialog.findAll('h2')).toHaveLength(1)
    expect(dialog.get('form input').attributes('type')).toBe('password')
    expect(dialog.get('.ui-dialog__actions button[type="submit"]').attributes('form')).toBe('password-form')
    expect(dialog.text().indexOf('Пароль')).toBeLessThan(dialog.text().indexOf('Сохранить'))
    expect(dialog.findAll('button')).toHaveLength(2)
  })

  it('does not reserve an empty actions area for existing default-slot consumers', async () => {
    const dialog = await mountSuspended(UiDialog, {
      props: { open: false, label: 'Назад' }, slots: { default: '<p>Описание</p><button>Назад</button>' },
    })
    expect(dialog.get('button').text()).toBe('Назад')
    expect(dialog.find('.ui-dialog__actions').exists()).toBe(false)
    expect(dialog.find('h2').exists()).toBe(false)
  })
})

it('associates password errors with the input and preserves an existing hint', async () => {
  const field = await mountSuspended(PasswordField, {
    props: { label: 'Новый пароль', modelValue: '', error: 'Введите не менее 8 символов.' },
    attrs: { id: 'new-password', 'aria-describedby': 'password-hint' },
  })
  const input = field.get('input')
  const error = field.get('[role="alert"]')
  const labelId = input.attributes('aria-labelledby')
  expect(labelId).toBeTruthy()
  expect(field.get(`[id="${labelId}"]`).text()).toBe('Новый пароль')
  expect(input.attributes('aria-invalid')).toBe('true')
  expect(input.attributes('aria-describedby')?.split(' ')).toEqual(['password-hint', error.attributes('id')])
  expect(error.text()).toBe('Введите не менее 8 символов.')
  expect(input.attributes('id')).toBe('new-password')
  await input.setValue('new-password-value')
  expect(field.emitted('update:modelValue')?.at(-1)).toEqual(['new-password-value'])
  await field.setProps({ error: '' })
  expect(field.find('[role="alert"]').exists()).toBe(false)
  expect(input.attributes('aria-describedby')).toBe('password-hint')
  expect(input.attributes('aria-invalid')).toBeUndefined()
})

it('preserves a caller-supplied accessible name and external invalid state', async () => {
  const field = await mountSuspended(PasswordField, {
    props: { label: 'Пароль', modelValue: '' },
    attrs: { 'aria-label': 'Подтвердите текущий пароль', 'aria-invalid': 'true', 'aria-describedby': 'external-error' },
  })
  expect(field.get('input').attributes('aria-label')).toBe('Подтвердите текущий пароль')
  expect(field.get('input').attributes('aria-labelledby')).toBeUndefined()
  expect(field.get('input').attributes('aria-invalid')).toBe('true')
  expect(field.get('input').attributes('aria-describedby')).toBe('external-error')
})
