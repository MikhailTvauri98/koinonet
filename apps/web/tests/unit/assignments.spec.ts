import { describe, expect, it } from 'vitest'
import type { EventItem, EventSlot } from '~/composables/useEvents'
import { isAssigned, ownSlots } from '~/utils/assignments'

const assignment = (personId: string, id = `a-${personId}`): EventSlot['assignments'][number] => ({
  id, person: { id: personId, full_name: null, short_name: null, photo_thumb_url: null }, created_at: null,
})
const slot = (id: string, people: string[], over: Partial<EventSlot> = {}): EventSlot => ({
  id, label: `Слот ${id}`, resource_type: 'person', role: null, required_count: 2, filled_count: people.length,
  sort_order: 0, can_fill: false, assignments: people.map(person => assignment(person)), ...over,
})
const event = (slots: EventSlot[]): EventItem => ({
  id: 'e1', chat_id: null, owner_type: 'church', ministry: null, template_id: null, occurrence_date: null,
  title: 'Воскресное служение', description: null, location: null,
  starts_at: '2026-11-22T08:00:00Z', ends_at: '2026-11-22T10:00:00Z', visibility: 'church', status: 'scheduled',
  cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [], slots,
})

describe('isAssigned', () => {
  it('is true when the person is in any slot', () => {
    const item = event([slot('s1', ['p2']), slot('s2', ['p3', 'p1'])])
    expect(isAssigned(item, 'p1')).toBe(true)
    expect(isAssigned(item, 'p2')).toBe(true)
  })

  it.each([null, undefined, ''])('is false without a person id (%j)', (personId) => {
    expect(isAssigned(event([slot('s1', ['p1'])]), personId)).toBe(false)
  })

  it('is false for an event without slots or with empty slots', () => {
    expect(isAssigned(event([]), 'p1')).toBe(false)
    expect(isAssigned(event([slot('s1', [])]), 'p1')).toBe(false)
  })

  it('is false when the server hid the assignments and only the count is known', () => {
    expect(isAssigned(event([slot('s1', [], { filled_count: 2 })]), 'p1')).toBe(false)
  })

  it('matches the assigned person, not the assignment id', () => {
    const item = event([{ ...slot('s1', []), assignments: [assignment('p2', 'p1')] }])
    expect(isAssigned(item, 'p1')).toBe(false)
  })
})

describe('ownSlots', () => {
  it('returns only the slots of the person, in event order', () => {
    const item = event([slot('s1', ['p1']), slot('s2', ['p2']), slot('s3', ['p2', 'p1'])])
    expect(ownSlots(item, 'p1').map(own => own.id)).toEqual(['s1', 's3'])
    expect(ownSlots(item, 'p2').map(own => own.id)).toEqual(['s2', 's3'])
  })

  it('returns nothing without a person id or with hidden assignments', () => {
    expect(ownSlots(event([slot('s1', ['p1'])]), null)).toEqual([])
    expect(ownSlots(event([slot('s1', ['p1'])]), undefined)).toEqual([])
    expect(ownSlots(event([slot('s1', [], { filled_count: 1 })]), 'p1')).toEqual([])
  })
})
