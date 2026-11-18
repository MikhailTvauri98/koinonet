// Каталог совпадает с enum MinistryColor модуля Ministries; API отдаёт ключ строкой или null.
export type MinistryColorKey = 'violet' | 'teal' | 'rose' | 'amber' | 'sky' | 'green'

export const MINISTRY_COLORS: readonly { key: MinistryColorKey, label: string }[] = Object.freeze([
  { key: 'violet', label: 'Фиолетовый' },
  { key: 'teal', label: 'Бирюзовый' },
  { key: 'rose', label: 'Розовый' },
  { key: 'amber', label: 'Янтарный' },
  { key: 'sky', label: 'Голубой' },
  { key: 'green', label: 'Зелёный' },
])

function isMinistryColorKey(value: unknown): value is MinistryColorKey {
  return MINISTRY_COLORS.some(color => color.key === value)
}

/** CSS-значение цвета владельца; событие церкви, служение без цвета и неизвестный ключ — нейтральный цвет церкви. */
export function ministryColorVar(ministry: { color?: string | null } | null): string {
  const color = ministry?.color
  return isMinistryColorKey(color) ? `var(--ui-ministry-${color})` : 'var(--ui-ministry-church)'
}

/** Устойчивый ключ палитры по идентификатору (FNV-1a): один человек всегда получает один оттенок. */
export function colorKeyForId(id: string): MinistryColorKey {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return MINISTRY_COLORS[(hash >>> 0) % MINISTRY_COLORS.length]!.key
}
