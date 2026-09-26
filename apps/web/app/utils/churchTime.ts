// Даты показываются в часовом поясе церкви, а не устройства
// (docs/architecture.md, раздел 10). Часовой пояс приходит из `GET /settings`
// (useChurchTimezone, composables/useChurchTimezone.ts) — этот файл сам
// сети не касается: чистые функции, принимающие часовой пояс параметром,
// чтобы их можно было проверить тестом с поясом, отличным от машины
// (tests/unit/churchTime.spec.ts), и переиспользовать и в «Устройствах», и
// в «Журнале».

/**
 * Смещение часового пояса `timeZone` относительно UTC в минутах на момент
 * `instant` (положительное — восточнее Гринвича). `Intl.DateTimeFormat` не
 * отдаёт смещение числом напрямую (только `timeZoneName`, локаль-зависимую
 * строку вроде «GMT+3») — вместо разбора строки формируем дату из тех же
 * частей, которые видит `timeZone` в этот момент, и сравниваем с исходным
 * инстантом. Разница и есть смещение.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'))

  return (asUtc - instant.getTime()) / 60_000
}

/**
 * UTC-момент полуночи `dateOnly` (`YYYY-MM-DD`) по местным часам `timeZone`.
 * Смещение берётся на приближённый момент (та же дата, интерпретированная
 * как UTC) — для разницы часовых поясов проекта этого достаточно, разбор
 * границы перевода стрелок ровно в полночь не требуется ни одним экраном.
 */
function startOfDayInTimeZone(dateOnly: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateOnly}T00:00:00.000Z`)
  const offset = offsetMinutesAt(naiveUtc, timeZone)
  return new Date(naiveUtc.getTime() - offset * 60_000)
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Нижняя граница фильтра журнала по периоду (раздел 6.5 архитектуры):
 * человек выбирает день «с» в часовом поясе церкви — начало этого дня,
 * переведённое в UTC, для параметра `from` (`GET /audit`, сравнение `>=`).
 */
export function churchDayStartToUtc(dateOnly: string, timeZone: string): string {
  return startOfDayInTimeZone(dateOnly, timeZone).toISOString()
}

/**
 * Верхняя граница того же фильтра, день «по» включительно. `GET /audit`
 * сравнивает `created_at` через `<=` (AuditController.php), поэтому граница —
 * не полночь следующего дня, а момент перед ней, тоже в часовом поясе церкви.
 */
export function churchDayEndToUtc(dateOnly: string, timeZone: string): string {
  return new Date(startOfDayInTimeZone(addDays(dateOnly, 1), timeZone).getTime() - 1).toISOString()
}

const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

/** Дата и время `iso` в часовом поясе церкви, вид `дд.мм.гггг, чч:мм`. */
export function formatChurchDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { ...DATE_TIME_FORMAT_OPTIONS, timeZone }).format(new Date(iso))
}
