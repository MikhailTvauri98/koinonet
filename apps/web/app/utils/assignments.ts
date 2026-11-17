import type { components, operations } from '~~/types/api'
import type { EventItem, EventSlot } from '~/composables/useEvents'

export type SlotCandidate = components['schemas']['CandidateResource']
export type Assignment = components['schemas']['EventAssignmentResource']
export type AssignmentResponse = operations['assignment.store']['responses'][201]['content']['application/json']
export type AssignmentWarning = AssignmentResponse['warnings'][number]

// Скрытые сервером назначения приходят пустым списком при ненулевом filled_count: такой слот не считается своим.
function holds(slot: EventSlot, personId: string) {
  return slot.assignments.some(assignment => assignment.person.id === personId)
}

export function isAssigned(event: EventItem, personId: string | null | undefined): boolean {
  return !!personId && event.slots.some(slot => holds(slot, personId))
}

export function ownSlots(event: EventItem, personId: string | null | undefined): EventSlot[] {
  return personId ? event.slots.filter(slot => holds(slot, personId)) : []
}
