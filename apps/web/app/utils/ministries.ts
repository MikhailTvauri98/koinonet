import type { components } from '~~/types/api'

export type Ministry = components['schemas']['MinistryResource']
export type Member = components['schemas']['MemberResource']
export type MinistryRole = components['schemas']['RoleResource']

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
