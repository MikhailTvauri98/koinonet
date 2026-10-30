import type { components } from '~~/types/api'
export type SlotChoice = components['schemas']['SlotChoicesResource']
export type SlotDraft = { role_id: string | null, label: string | null, required_count: number }
export function slotError(slots: SlotDraft[]): string {
  if (slots.length > 30) return 'Допускается до 30 слотов.'
  for (const slot of slots) {
    if (!slot.role_id && !slot.label?.trim()) return 'Свободному слоту нужна подпись'
    if ((slot.label?.length ?? 0) > 100 || !Number.isInteger(slot.required_count) || slot.required_count < 1 || slot.required_count > 50) return 'Подпись — до 100 символов, количество — от 1 до 50.'
  }
  return ''
}
