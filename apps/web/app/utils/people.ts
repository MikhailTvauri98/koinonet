import type { components, operations } from '~~/types/api'

export type Person = components['schemas']['PersonResource']
export type PersonStatus = components['schemas']['PersonStatus']
export type PeopleResponse = operations['person.index']['responses'][200]['content']['application/json']
export type PersonCreatedResponse = operations['person.store']['responses'][201]['content']['application/json']

export const personStatuses: Record<PersonStatus, string> = {
  member: 'Член церкви', attendee: 'Посещает', guest: 'Гость',
}

export interface PeopleError {
  statusCode?: number
  status?: number
  data?: { message?: string, errors?: Record<string, string[]> }
}

export function peopleErrorMessage(error: unknown, fallback: string): string {
  const failure = error as PeopleError | undefined
  if (failure?.statusCode === 403 || failure?.status === 403) return 'Нет права на это действие.'
  return failure?.data?.message || fallback
}
