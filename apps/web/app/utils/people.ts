import type { components, operations } from '~~/types/api'

export type Person = components['schemas']['PersonResource']
export type PersonStatus = components['schemas']['PersonStatus']
export type PeopleResponse = operations['person.index']['responses'][200]['content']['application/json']
export type PersonCreatedResponse = operations['person.store']['responses'][201]['content']['application/json']

export const personStatuses: Record<PersonStatus, string> = {
  member: 'Член церкви', attendee: 'Посещает', guest: 'Гость',
}
