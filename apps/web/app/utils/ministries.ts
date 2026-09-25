import type { components, operations } from '~~/types/api'

export type Ministry = components['schemas']['MinistryResource']
export type Member = components['schemas']['MemberResource']
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

/** Роли, доступные для назначения участнику: объединение ролей всех уже
 * загруженных участников служения, без обращения к `GET /ministries/{id}/roles`
 * (он защищён `roles.manage`, а не `members.manage` — см. RolePolicy::canManage
 * в apps/api, задача 28 отчёт, раздел "сомнения"). Поэтому роль, которую пока
 * никто в служении не носит, здесь не появится: назначить такую роль
 * участнику можно будет только со вкладки ролей (задача 29) или после того,
 * как её получит хотя бы один участник.
 */
export function rolesCatalogue(members: Member[]): { id: string, name: string }[] {
  const byId = new Map<string, string>()
  for (const member of members) {
    for (const role of member.roles) byId.set(role.id, role.name)
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
