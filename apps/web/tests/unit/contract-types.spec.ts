import { describe, expectTypeOf, it } from 'vitest'
import type { components } from '~~/types/api'
import type { Permissions } from '~/composables/useCan'
import type { MeResponse } from '~/stores/auth'

// Проверки на уровне типов: их доказывает `npm run typecheck`, а не прогон
// Vitest. Снимок вошедшего и права берутся из сгенерированной схемы, а не из
// рукописных интерфейсов — расхождение ответа с клиентом роняет тайпчек.
describe('auth contract types', () => {
  it('describes ministry permissions as a map from a ministry id to permission keys', () => {
    expectTypeOf<components['schemas']['UserPermissionsResource']['ministries']>()
      .toEqualTypeOf<Record<string, string[]>>()
  })

  it('takes the signed-in snapshot and the permissions from the generated schema', () => {
    expectTypeOf<MeResponse>().toEqualTypeOf<components['schemas']['MeResource']>()
    expectTypeOf<Permissions>().toEqualTypeOf<components['schemas']['UserPermissionsResource']>()
  })
})
