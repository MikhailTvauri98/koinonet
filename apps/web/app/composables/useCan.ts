import type { components } from '~~/types/api'

// Права вошедшего из `GET /auth/me`: глобальные ключи и словарь «служение →
// ключи прав в нём» (docs/architecture.md, раздел 6.2).
export type Permissions = components['schemas']['UserPermissionsResource']

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

/**
 * `setMe`/`reset` в сторе заменяют `permissions` целиком, а не мутируют объект
 * на месте, и `AppNav`/страницы вызывают `useCan()` один раз в setup постоянного
 * макета. Поэтому здесь нельзя один раз вызвать `permissionChecker(auth.permissions)`
 * и закрыть `can`/`canIn` над этим снимком — они бы навсегда остались со
 * старыми правами. Вместо этого каждый вызов `can`/`canIn` читает
 * `auth.permissions` заново, так что чтение попадает в реактивный `computed`/
 * `render`, вызвавший его, и пересчитывается при смене прав посреди сессии
 * (docs/architecture.md, раздел 10).
 */
export function useCan() {
  const auth = useAuthStore()
  return {
    can: (key: string) => permissionChecker(auth.permissions).can(key),
    canIn: (ministryId: string, key: string) => permissionChecker(auth.permissions).canIn(ministryId, key),
  }
}

/**
 * Правило видимости пункта «Служения» в навигации (`AppNav.vue`, `index.vue`):
 * показываем тому, кому есть что там смотреть — состоит хотя бы в одном
 * служении, либо видит или администрирует все служения без участия в них.
 *
 * Каталог прав (docs/architecture.md, раздел 6.1) не содержит отдельного
 * права `ministries.view` — список служений сам по себе правом не защищён.
 * Значит, кому показывать пункт меню — решение только клиента; сервер, как
 * обычно, остаётся источником правды по каждому конкретному служению,
 * которое откроется по этой ссылке (раздел 6.4 не описывает список служений
 * в правилах видимости вообще, только карточки и вложенные разделы).
 */
export function hasVisibleMinistries(permissions: Permissions): boolean {
  const { can } = permissionChecker(permissions)
  return can('ministries.view_all') || can('ministries.manage_all') || Object.keys(permissions.ministries).length > 0
}

// Тот же приём, что у useCan(): читаем auth.permissions заново при каждом
// пересчёте computed, а не один раз при создании — иначе пункт меню не
// среагирует на смену прав посреди сессии.
export function useHasVisibleMinistries() {
  const auth = useAuthStore()
  return computed(() => hasVisibleMinistries(auth.permissions))
}
