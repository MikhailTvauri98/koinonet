import type { components } from '~~/types/api'
import { churchLocalInstants, churchLocalToUtc, utcToChurchLocal } from '~/utils/churchWallTime'
export type SlotChoice = components['schemas']['SlotChoicesResource']
export type SlotDraft = { role_id: string | null, label: string | null, required_count: number }
export function slotFieldErrors(slots: SlotDraft[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  if (slots.length > 30) errors.slots = ['Допускается до 30 слотов.']
  slots.forEach((slot, index) => {
    if (!slot.role_id && !slot.label?.trim()) errors[`slots.${index}.label`] = ['Свободному слоту нужна подпись']
    else if ((slot.label?.length ?? 0) > 100) errors[`slots.${index}.label`] = ['Подпись — до 100 символов.']
    if (!Number.isInteger(slot.required_count) || slot.required_count < 1 || slot.required_count > 50) errors[`slots.${index}.required_count`] = ['Количество — от 1 до 50.']
  })
  return errors
}
export function slotError(slots: SlotDraft[]): string {
  if (slots.length > 30) return 'Допускается до 30 слотов.'
  for (const slot of slots) {
    if (!slot.role_id && !slot.label?.trim()) return 'Свободному слоту нужна подпись'
    if ((slot.label?.length ?? 0) > 100 || !Number.isInteger(slot.required_count) || slot.required_count < 1 || slot.required_count > 50) return 'Подпись — до 100 символов, количество — от 1 до 50.'
  }
  return ''
}

/** Quick durations in minutes, labelled «1 ч · 1,5 ч · 2 ч · 3 ч». */
export const DURATION_PRESETS = [60, 90, 120, 180] as const
export function durationPresetLabel(minutes: number): string {
  const hours = minutes / 60
  return `${String(hours).replace('.', ',')} ч`
}
/** End wall-clock fields (church zone) for a start plus preset; may roll to the next day. Non-zero start seconds are kept. `startIso` pins the exact start instant (a later repeated hour). */
export function endFromPreset(startDate: string, startTime: string, minutes: number, timeZone: string, startIso?: string): { date: string, time: string } {
  const start = Date.parse(startIso ?? churchLocalToUtc(`${startDate}T${startTime}`, timeZone))
  const [date, time] = utcToChurchLocal(new Date(start + minutes * 60000).toISOString(), timeZone).split('T') as [string, string]
  return { date, time: time.endsWith(':00') ? time.slice(0, 5) : time }
}
/** True when the wall-clock time occurs twice in the church zone (the repeated hour when clocks go back). */
export function isAmbiguousChurchTime(date: string, time: string, timeZone: string): boolean {
  try { return churchLocalInstants(`${date}T${time}`, timeZone).length > 1 } catch { return false }
}
