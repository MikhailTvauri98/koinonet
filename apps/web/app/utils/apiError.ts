// Один язык отказов на весь клиент. Ошибка ofetch несёт `statusCode` (и
// `status`) и разобранное тело ответа в `data`; у сетевого сбоя статуса нет.
//
// Показывается текст сервера только у `422`: это сообщения проверки полей и
// нарушения доменных правил, написанные по-русски для человека
// (docs/architecture.md, раздел 8). Остальные статусы получают свою фразу или
// запасной текст экрана — иначе наружу попали бы служебные ответы
// («Too Many Attempts.», «Server Error», имя класса модели у `404`).
interface ApiFailure {
  statusCode?: unknown
  status?: unknown
  data?: unknown
}

type FailureBody = { code?: unknown, message?: unknown, errors?: unknown } | undefined

const STATUS_MESSAGES: Record<number, string> = {
  403: 'Нет права на это действие.',
  404: 'Запись не найдена — возможно, её удалили.',
  429: 'Слишком много попыток. Подождите минуту.',
}

/** HTTP-статус отказа; `undefined` — ответа не было (сеть). */
export function apiErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const { statusCode, status } = error as ApiFailure
  if (typeof statusCode === 'number') return statusCode
  return typeof status === 'number' ? status : undefined
}

function failureBody(error: unknown): FailureBody {
  if (typeof error !== 'object' || error === null) return undefined
  const { data } = error as ApiFailure
  return typeof data === 'object' && data !== null ? data as FailureBody : undefined
}

/** Код нарушенного доменного правила (`422` с полем `code`), если он есть. */
export function apiErrorCode(error: unknown): string | undefined {
  const code = failureBody(error)?.code
  return apiErrorStatus(error) === 422 && typeof code === 'string' ? code : undefined
}

/**
 * Текст отказа для человека: `403`, `404`, `429` — своей фразой, `422` —
 * сообщением сервера, всё прочее (ошибка сервера, сеть) — запасным текстом
 * экрана, который говорит, что не удалось и что делать.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const status = apiErrorStatus(error)
  if (status !== undefined && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  if (status === 422) {
    const message = failureBody(error)?.message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

/** Сообщения проверки по полям — только у `422`. */
export function apiFieldErrors(error: unknown): Record<string, string[]> {
  const errors = failureBody(error)?.errors
  if (apiErrorStatus(error) !== 422 || typeof errors !== 'object' || errors === null) return {}
  return errors as Record<string, string[]>
}
