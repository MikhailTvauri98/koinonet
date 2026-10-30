/** Wall-clock fields rendered explicitly in the church zone, including seconds. */
export function utcToChurchLocal(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const field = (name: string) => parts.find(p => p.type === name)!.value
  return `${field('year')}-${field('month')}-${field('day')}T${field('hour')}:${field('minute')}:${field('second')}`
}

/** Resolve offsets on both sides of a transition; gaps fail, repeated times choose the earlier instant. */
export function churchLocalToUtc(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) throw new Error('Укажите дату и время.')
  const normalized = local.length === 16 ? `${local}:00` : local
  const naive = Date.parse(`${normalized}Z`)
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== normalized) throw new Error('Некорректная дата или время.')
  const candidates = new Set<number>()
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = naive + hours * 3600000
    const offset = Date.parse(`${utcToChurchLocal(new Date(sample).toISOString(), timeZone)}Z`) - sample
    const candidate = naive - offset
    if (utcToChurchLocal(new Date(candidate).toISOString(), timeZone) === normalized) candidates.add(candidate)
  }
  if (!candidates.size) throw new Error('Такого времени нет в часовом поясе церкви из-за перевода часов.')
  return new Date(Math.min(...candidates)).toISOString()
}
