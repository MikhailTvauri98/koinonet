import type { components, operations } from '~~/types/api'

// Раньше здесь были полностью рукописные типы: RoleResource.permissions
// генерировался как `unknown[]`, а ответ `role.usage` — объединением двух
// разных форм (dedoc/scramble путал форму по двум `return` в PHP на разные
// типы; поправлено в apps/api — RoleResource::toArray и
// RoleUsageCollector::for проводят массив через типизированную переменную
// вместо литерала `[]`/пайплайна Collection без явного типа, задача 29,
// доделка). Теперь оба места производные от `components`/`operations` — при
// следующем расхождении формы ответа с клиентом это уронит `nuxt typecheck`,
// а не тихо разойдётся.
//
// RoleLike — не сам `RoleResource` целиком: `description`/`is_system`
// сделаны необязательными, потому что RoleEditor принимает роль и из мест,
// где сервер их не прислал (тесты компонента передают {id, name,
// permissions} без scope/ministry_id/description/is_system — тем же
// набором полей, каким RoleEditor реально пользуется).
export type RoleLike = Pick<components['schemas']['RoleResource'], 'id' | 'name' | 'permissions'>
  & Partial<Pick<components['schemas']['RoleResource'], 'description' | 'is_system'>>

export type PermissionCatalogueEntry = components['schemas']['PermissionResource']

export type RoleUsage = operations['role.usage']['responses'][200]['content']['application/json']['data']
export type RoleUsageBlocker = RoleUsage['blockers'][number]

export interface RolesError {
  statusCode?: number
  status?: number
  data?: { code?: string, message?: string, errors?: Record<string, string[]> }
}

export function rolesErrorMessage(error: unknown, fallback: string): string {
  const failure = error as RolesError | undefined
  if (failure?.statusCode === 403 || failure?.status === 403) return 'Нет права на это действие.'
  return failure?.data?.message || fallback
}

// Каталог прав (GET /permissions) не отдаёт группу — только ключ, область,
// название и описание (docs/architecture.md 6.1). Группировка "по смысловому
// префиксу ключа" (шаг 3 брифа задачи 29) остаётся решением клиента:
// заголовки — только оформление, сам ключ виден в интерфейсе и без записи
// здесь (см. permissionGroupPrefix ниже, ключ группируется всегда, заголовок —
// с фолбэком на сам префикс).
export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  people: 'Люди',
  ministries: 'Служения',
  ministry: 'Служение',
  members: 'Участники',
  roles: 'Роли',
  settings: 'Настройки',
  audit: 'Журнал',
  calendar: 'Календарь',
  announcements: 'Объявления',
  chats: 'Чаты',
  chat: 'Чат',
  events: 'События',
  slots: 'Слоты',
}

export function permissionGroupPrefix(key: string): string {
  return key.split('.')[0] ?? key
}

// Числительное согласование "у роли N носителей" (архитектура называет
// носителей ролей этим словом в разделах 6.3 и 15).
export function pluralizeCarriers(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return 'носителей'
  if (mod10 === 1) return 'носитель'
  if (mod10 >= 2 && mod10 <= 4) return 'носителя'
  return 'носителей'
}
