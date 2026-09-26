import type { components } from '~~/types/api'

export type MediaLike = components['schemas']['MediaResource']
export type MediaPurpose = components['schemas']['MediaPurpose']

export interface MediaError {
  statusCode?: number
  status?: number
  data?: { message?: string }
}

export function mediaErrorMessage(error: unknown, fallback: string): string {
  const failure = error as MediaError | undefined
  if (failure?.statusCode === 403 || failure?.status === 403) return 'Нет права на это действие.'
  return failure?.data?.message || fallback
}
