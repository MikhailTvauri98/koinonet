export interface Permissions {
  administrator: boolean
  global: string[]
  ministries: Record<string, string[]>
}

/**
 * Чистая функция проверки прав: повторяет вычисление сервера (docs/architecture.md
 * раздел 6.2 — can/canInMinistry). Права на клиенте только прячут недоступные
 * действия в интерфейсе, сервер остаётся единственным источником правды.
 */
export function permissionChecker(permissions: Permissions) {
  const can = (key: string) => permissions.administrator || permissions.global.includes(key)

  const canIn = (ministryId: string, key: string) =>
    can('ministries.manage_all') || (permissions.ministries[ministryId] ?? []).includes(key)

  return { can, canIn }
}

export function useCan() {
  const auth = useAuthStore()
  return permissionChecker(auth.permissions)
}
