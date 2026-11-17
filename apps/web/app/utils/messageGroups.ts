import type { ChatMessage } from '~/composables/useChatMessages'

export type MessageGroupItem
  = { kind: 'day', day: string }
    | { kind: 'group', senderId: string | null, own: boolean, messages: ChatMessage[] }

const dayFormatters = new Map<string, Intl.DateTimeFormat>()
function churchDay(iso: string, timeZone: string) {
  let formatter = dayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timeZone, formatter)
  }
  return formatter.format(new Date(iso))
}

/**
 * Лента чата: разделители дней и группы подряд идущих сообщений одного отправителя.
 * День считается по часовому поясу церкви. Группа ломается сменой дня, сменой
 * `sender.id` (имя не участвует: оно может быть скрыто правами) и паузой больше
 * `gapMinutes`. Удалённый человек (`sender: null`) не склеивается ни с кем.
 */
export function groupMessages(messages: ChatMessage[], timeZone: string, gapMinutes = 5, userId?: string): MessageGroupItem[] {
  const items: MessageGroupItem[] = []
  let day: string | undefined
  let last: Extract<MessageGroupItem, { kind: 'group' }> | undefined
  let previousAt = 0
  for (const message of messages) {
    const messageDay = churchDay(message.created_at, timeZone)
    const at = Date.parse(message.created_at)
    const senderId = message.sender?.id ?? null
    if (messageDay !== day) {
      items.push({ kind: 'day', day: messageDay })
      day = messageDay
      last = undefined
    }
    if (last && senderId !== null && last.senderId === senderId && at - previousAt <= gapMinutes * 60_000) last.messages.push(message)
    else {
      last = { kind: 'group', senderId, own: senderId !== null && senderId === userId, messages: [message] }
      items.push(last)
    }
    previousAt = at
  }
  return items
}

/** Подпись отправителя в ленте: короткое имя, нейтральное слово для скрытого, отдельная для стёртого. */
export function senderLabel(sender: ChatMessage['sender']): string {
  return sender ? sender.person?.short_name || 'Участник' : 'Удалённый человек'
}
