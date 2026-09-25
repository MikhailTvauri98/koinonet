import type { components, operations } from '~~/types/api'

export type Ministry = components['schemas']['MinistryResource']
export type Member = components['schemas']['MemberResource']
export type MinistryRole = components['schemas']['RoleResource']
export type MinistriesResponse = operations['ministry.index']['responses'][200]['content']['application/json']
export type MembersResponse = operations['ministryMember.index']['responses'][200]['content']['application/json']
export type AddMemberRequest = operations['ministryMember.store']['requestBody']['content']['application/json']

export interface MinistriesError {
  statusCode?: number
  status?: number
  data?: { code?: string, message?: string, errors?: Record<string, string[]> }
}

export function ministriesErrorMessage(error: unknown, fallback: string): string {
  const failure = error as MinistriesError | undefined
  if (failure?.statusCode === 403 || failure?.status === 403) return 'Нет права на это действие.'
  return failure?.data?.message || fallback
}
