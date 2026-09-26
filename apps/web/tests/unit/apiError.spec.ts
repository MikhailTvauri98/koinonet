// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { apiErrorMessage, apiFieldErrors } from '~/utils/apiError'

// Ошибка ofetch несёт и `statusCode`, и `status`; сетевой сбой — ни того, ни
// другого.
function failure(status: number | undefined, data?: unknown) {
  return Object.assign(new Error('failed'), { statusCode: status, status, data })
}

const fallback = 'Не удалось сохранить. Попробуйте ещё раз.'

describe('apiErrorMessage', () => {
  it('shows the server text of a validation or domain rule refusal', () => {
    expect(apiErrorMessage(failure(422, { code: 'role.in_use', message: 'Роль используется.' }), fallback))
      .toBe('Роль используется.')
  })

  it('falls back when a 422 comes without a message', () => {
    expect(apiErrorMessage(failure(422, {}), fallback)).toBe(fallback)
  })

  it('names a missing right without the server text', () => {
    expect(apiErrorMessage(failure(403, { message: 'This action is unauthorized.' }), fallback))
      .toBe('Нет права на это действие.')
  })

  it('says the record is gone instead of the server text, which may name a model class', () => {
    expect(apiErrorMessage(failure(404, { message: 'No query results for model [App\\Modules\\Ministries\\Models\\Ministry] 01J' }), fallback))
      .toBe('Запись не найдена — возможно, её удалили.')
  })

  it('asks to wait after too many attempts', () => {
    expect(apiErrorMessage(failure(429, { message: 'Too Many Attempts.' }), fallback))
      .toBe('Слишком много попыток. Подождите минуту.')
  })

  it('uses the fallback for a server error and for a network failure', () => {
    expect(apiErrorMessage(failure(500, { message: 'Server Error' }), fallback)).toBe(fallback)
    expect(apiErrorMessage(failure(502, '<html>Bad Gateway</html>'), fallback)).toBe(fallback)
    expect(apiErrorMessage(failure(undefined), fallback)).toBe(fallback)
    expect(apiErrorMessage(new TypeError('Failed to fetch'), fallback)).toBe(fallback)
  })

  it('does not pass through any other server text', () => {
    expect(apiErrorMessage(failure(413, { message: 'Request Entity Too Large' }), fallback)).toBe(fallback)
    expect(apiErrorMessage(failure(419, { message: 'CSRF token mismatch.' }), fallback)).toBe(fallback)
  })
})

describe('apiFieldErrors', () => {
  it('returns the field messages of a validation refusal', () => {
    expect(apiFieldErrors(failure(422, { message: 'x', errors: { timezone: ['Часовой пояс не найден.'] } })))
      .toEqual({ timezone: ['Часовой пояс не найден.'] })
  })

  it('returns nothing for other failures', () => {
    expect(apiFieldErrors(failure(500, { errors: { timezone: ['x'] } }))).toEqual({})
    expect(apiFieldErrors(failure(undefined))).toEqual({})
  })
})
