import type { Pinia } from 'pinia'
import { useNuxtApp } from '#app'
import { vi } from 'vitest'
import { useAuthStore, type MePerson, type MeUser } from '~/stores/auth'
import { useNotificationsStore } from '~/stores/notifications'

export interface PermissionGrant {
  administrator?: boolean
  global?: string[]
  ministries?: Record<string, string[]>
}

const signedInUser: MeUser = { id: 'u-signed-in', phone: null, email: 'signed-in@church.test', ical_url: 'https://church.test/calendar.ics' }
const signedInPerson: MePerson = {
  id: 'p-signed-in', last_name: 'Вошедший', first_name: 'Тест', patronymic: null, status: 'member',
}

/**
 * Единственный способ дать права в компонентном тесте: пишет их в настоящий
 * стор `auth` через `setMe`, как это делает ответ `/auth/me`. Экран читает
 * права через настоящий `useCan()`, поэтому смена прав посреди теста
 * перерисовывает экран так же, как в приложении, — подмена `useCan` снимком
 * этого не проверяла.
 *
 * Права бывают только у вошедшего, поэтому сессия заодно отмечается
 * выясненной и вошедшей (аккаунт по умолчанию, если в сторе его ещё нет).
 * Иначе глобальный middleware при каждом монтировании спрашивал бы
 * `/auth/me` через подменённый в тесте `useApi` и перезаписывал бы стор его
 * ответом.
 *
 * По умолчанию — Pinia приложения Nuxt: её получают компоненты, смонтированные
 * `mountSuspended` без своих плагинов. Тест, монтирующий со своей Pinia
 * (`global.plugins`), передаёт её вторым аргументом. Вызов без прав
 * сбрасывает их — это нужно в `beforeEach`, потому что Pinia приложения живёт
 * весь файл тестов.
 */
export function grantPermissions(grant: PermissionGrant = {}, pinia: Pinia = useNuxtApp().$pinia): void {
  // Permission screens do not exercise network/channel initialization; its
  // real lifecycle has dedicated notifications-auth and store tests.
  vi.spyOn(useNotificationsStore(pinia), 'subscribe').mockResolvedValue(undefined)
  const auth = useAuthStore(pinia)
  auth.setMe({
    user: auth.user ?? signedInUser,
    person: auth.person ?? signedInPerson,
    permissions: {
      administrator: grant.administrator ?? false,
      global: [...(grant.global ?? [])],
      ministries: Object.fromEntries(Object.entries(grant.ministries ?? {}).map(([id, keys]) => [id, [...keys]])),
    },
  })
  auth.initialized = true
}
