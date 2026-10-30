import type { components } from '~~/types/api'
import type { Permissions } from '~/composables/useCan'
import { permissionChecker } from '~/composables/useCan'
export type TemplateItem = components['schemas']['EventTemplateResource']
export type CalendarOwner = { type: 'church' | 'ministry', ministryId?: string }
export function hasCalendarManagement(permissions: Permissions): boolean {
  const { can } = permissionChecker(permissions)
  return can('calendar.church.manage') || can('ministries.manage_all')
    || Object.values(permissions.ministries).some(keys => keys.includes('events.manage'))
}
