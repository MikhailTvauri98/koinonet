import { describe, expect, it } from 'vitest'
import { groupMessages } from '~/utils/messageGroups'
import type { ChatMessage } from '~/composables/useChatMessages'

function message(id: string, created_at: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, chat_id: 'c1', created_at, cursor: id, body: id, sender: { id: 'u1', person: { id: 'p1', full_name: 'Анна Петрова', short_name: 'Анна Петрова', photo_thumb_url: null } }, reply_to: null, attachments: [], deleted: false, edited_at: null, ...over } as ChatMessage
}
const sender = (id: string, name: string | null) => ({ id, person: { id: `p-${id}`, full_name: name, short_name: name, photo_thumb_url: null } }) as ChatMessage['sender']
const groups = (items: ReturnType<typeof groupMessages>) => items.filter(item => item.kind === 'group')

describe('groupMessages', () => {
  it('puts three consecutive messages of one sender into one group, after a day item', () => {
    const items = groupMessages([message('a', '2026-11-17T09:00:00Z'), message('b', '2026-11-17T09:01:00Z'), message('c', '2026-11-17T09:02:00Z')], 'UTC')
    expect(items.map(item => item.kind)).toEqual(['day', 'group'])
    expect(items[0]).toEqual({ kind: 'day', day: '2026-11-17' })
    expect(groups(items)[0]).toMatchObject({ senderId: 'u1', own: false })
    expect((groups(items)[0] as { messages: ChatMessage[] }).messages.map(m => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('splits the group by a pause longer than the gap, not by exactly the gap', () => {
    const six = groupMessages([message('a', '2026-11-17T09:00:00Z'), message('b', '2026-11-17T09:06:00Z')], 'UTC')
    expect(groups(six)).toHaveLength(2)
    const five = groupMessages([message('a', '2026-11-17T09:00:00Z'), message('b', '2026-11-17T09:05:00Z')], 'UTC')
    expect(groups(five)).toHaveLength(1)
  })

  it('starts a new day at church midnight even when the process zone differs', () => {
    // 20:59 UTC and 21:01 UTC are 23:59 and 00:01 in Moscow (UTC+3), but the same UTC day.
    const items = groupMessages([message('a', '2026-11-17T20:59:00Z'), message('b', '2026-11-17T21:01:00Z')], 'Europe/Moscow')
    expect(items.map(item => item.kind)).toEqual(['day', 'group', 'day', 'group'])
    expect(items.filter(item => item.kind === 'day').map(item => item.day)).toEqual(['2026-11-17', '2026-11-18'])
    // The same instants in UTC stay in one day and one group.
    expect(groupMessages([message('a', '2026-11-17T20:59:00Z'), message('b', '2026-11-17T21:01:00Z')], 'UTC').map(item => item.kind)).toEqual(['day', 'group'])
  })

  it('groups by sender id even when the name is hidden, and never merges different hidden senders', () => {
    const items = groupMessages([
      message('a', '2026-11-17T09:00:00Z', { sender: sender('h1', null) }),
      message('b', '2026-11-17T09:01:00Z', { sender: sender('h1', null) }),
      message('c', '2026-11-17T09:02:00Z', { sender: sender('h2', null) }),
    ], 'UTC')
    expect(groups(items).map(group => (group as { messages: ChatMessage[] }).messages.map(m => m.id))).toEqual([['a', 'b'], ['c']])
  })

  it('keeps two senders with the same name apart', () => {
    const items = groupMessages([message('a', '2026-11-17T09:00:00Z', { sender: sender('x', 'Анна Петрова') }), message('b', '2026-11-17T09:01:00Z', { sender: sender('y', 'Анна Петрова') })], 'UTC')
    expect(groups(items)).toHaveLength(2)
  })

  it('treats a deleted person as a separate group and a deleted message as part of its sender group', () => {
    const items = groupMessages([
      message('a', '2026-11-17T09:00:00Z'),
      message('gone', '2026-11-17T09:01:00Z', { sender: null }),
      message('b', '2026-11-17T09:02:00Z'),
      message('del', '2026-11-17T09:03:00Z', { deleted: true, body: null }),
    ], 'UTC')
    const result = groups(items) as { senderId: string | null, messages: ChatMessage[] }[]
    expect(result.map(group => group.senderId)).toEqual(['u1', null, 'u1'])
    expect(result[2]!.messages.map(m => m.id)).toEqual(['b', 'del'])
  })

  it('marks the current user own by sender id', () => {
    const items = groupMessages([message('a', '2026-11-17T09:00:00Z')], 'UTC', 5, 'u1')
    expect(groups(items)[0]).toMatchObject({ own: true })
  })

  it('returns nothing for no messages', () => {
    expect(groupMessages([], 'UTC')).toEqual([])
  })
})
