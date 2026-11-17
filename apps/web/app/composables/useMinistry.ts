import type { Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'

/**
 * Служение для шапки вкладки, которая само служение больше нигде не читает
 * (состав, объявления). Поздний ответ другого служения или прежней сессии не
 * применяется.
 */
export function useMinistry(id: Ref<string>) {
  const api = useApi(), auth = useAuthStore()
  const ministry = ref<Ministry | null>(null), error = ref(''), loading = ref(false)
  let generation = 0
  async function load() {
    const token = ++generation, session = auth.sessionVersion
    ministry.value = null; error.value = ''; loading.value = true
    try {
      const response = await api.get<{ data: Ministry }>(`/ministries/${encodeURIComponent(id.value)}`)
      if (token === generation && session === auth.sessionVersion) ministry.value = response.data
    } catch (failure) {
      if (token === generation && session === auth.sessionVersion) error.value = apiErrorMessage(failure, 'Не удалось загрузить служение. Попробуйте ещё раз.')
    } finally {
      if (token === generation && session === auth.sessionVersion) loading.value = false
    }
  }
  watch(id, () => { void load() })
  watch(() => auth.sessionVersion, () => { void load() })
  onBeforeUnmount(() => { generation++ })
  void load()
  return { ministry, error, loading, load }
}
