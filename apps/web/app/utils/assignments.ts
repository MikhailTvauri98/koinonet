import type { components, operations } from '~~/types/api'

export type SlotCandidate = components['schemas']['CandidateResource']
export type Assignment = components['schemas']['EventAssignmentResource']
export type AssignmentResponse = operations['assignment.store']['responses'][201]['content']['application/json']
export type AssignmentWarning = AssignmentResponse['warnings'][number]
