import { churchDateFormatter } from '~/composables/useChurchDate'

// Даты показываются в часовом поясе церкви, а не устройства
// (docs/architecture.md, раздел 10). Часовой пояс приходит из `GET /settings`
// (useChurchTimezone, composables/useChurchTimezone.ts) — этот файл сам
// сети не касается: чистые функции, принимающие часовой пояс параметром,
// чтобы их можно было проверить тестом с поясом, отличным от машины
// (tests/unit/churchTime.spec.ts), и переиспользовать и в «Устройствах», и
// в «Журнале».

/**
 * Локальная дата (`YYYY-MM-DD`) в `timeZone` на момент `instantMs`. Локаль
 * `en-CA` — единственная стандартная, которую `Intl.DateTimeFormat` сам
 * форматирует в этом порядке без сборки из частей.
 */
function localDateInTimeZone(instantMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instantMs)
}

// Половина суток по обе стороны от «наивной» полуночи с большим запасом:
// смещения часовых поясов лежат в диапазоне примерно от -12 до +14 часов,
// перевод стрелок добавляет ещё один-два часа — 48 часов гарантированно
// перекрывают любую комбинацию (см. ниже, почему точный час не нужен).
const SEARCH_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * UTC-момент начала суток `dateOnly` (`YYYY-MM-DD`) по местным часам
 * `timeZone` — первый момент, чья локальная дата равна `dateOnly`. В
 * большинстве поясов это ровно полночь, но в день перевода стрелок вперёд
 * полуночи может не быть вовсе (часы прыгают, например, с 00:00 на 01:00,
 * как в America/Santiago) — тогда это первый существующий момент суток.
 *
 * Раньше эта функция брала смещение пояса в момент «дата, прочитанная как
 * UTC» и вычитала его — что путает смещение соседних дней всякий раз, когда
 * этот приближённый момент оказывается по другую сторону перевода стрелок
 * от настоящей полуночи (типично для поясов с большим смещением от UTC,
 * например Pacific/Auckland, где `2026-04-05` в UTC приходится на разгар
 * ночи 4 апреля по местному времени, ещё до перевода). Итог — сдвиг границы
 * на час (а для Australia/Lord_Howe — на полчаса), обнаруженный ревью:
 * запись у края дня выпадала из фильтра журнала. Вместо приближения —
 * двоичный поиск по самой функции "локальная дата от момента": она
 * монотонна (локальная дата не убывает с ростом UTC-момента) и корректно
 * учитывает и пропуск, и повтор часа, потому что просто спрашивает
 * `Intl.DateTimeFormat`, а не пересчитывает смещение сама.
 */
function startOfDayInTimeZone(dateOnly: string, timeZone: string): Date {
  const naiveUtc = Date.parse(`${dateOnly}T00:00:00.000Z`)
  let low = naiveUtc - SEARCH_WINDOW_MS // локальная дата здесь заведомо раньше dateOnly
  let high = naiveUtc + SEARCH_WINDOW_MS // локальная дата здесь заведомо не раньше dateOnly

  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2)
    if (localDateInTimeZone(mid, timeZone) >= dateOnly) high = mid
    else low = mid
  }

  return new Date(high)
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

/** Дата и время `iso` в часовом поясе церкви, вид `дд.мм.гггг, чч:мм`. */
export function formatChurchDateTime(iso: string, timeZone: string): string {
  return churchDateFormatter(timeZone).formatNumericDateTime(iso)
}
