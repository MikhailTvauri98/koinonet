import type { components } from '~~/types/api'

export type Ministry = components['schemas']['MinistryResource']
export type Member = components['schemas']['MemberResource']
export type MinistryRole = components['schemas']['RoleResource']

/** «1 участник», «2 участника», «5 участников», «21 участник», «11 участников». */
export function membersCountLabel(count: number): string {
  const mod100 = count % 100, mod10 = count % 10
  const word = mod100 >= 11 && mod100 <= 14 ? 'участников' : mod10 === 1 ? 'участник' : mod10 >= 2 && mod10 <= 4 ? 'участника' : 'участников'
  return `${count} ${word}`
}
