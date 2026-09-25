import type { components } from '~~/types/api'

// RoleResource.permissions генерируется как `unknown[]` (dedoc/scramble не
// выводит `list<string>` из PHPDoc-формы array-shape, apps/api/.../RoleResource.php
// уже несёт верную аннотацию — это неточность самого генератора, не форма
// ответа). Свой тип точнее реального ответа сервера и используется вместо
// `components['schemas']['RoleResource']` везде, где нужен typed-массив прав.
export interface RoleLike {
  id: string
  name: string
  description?: string | null
  is_system?: boolean
  permissions: string[]
}

export type PermissionCatalogueEntry = components['schemas']['PermissionResource']

export interface RoleUsageBlocker {
  type: string
  id: string
  title: string
}

export interface RoleUsage {
  carriers: number
  blockers: RoleUsageBlocker[]
}

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
