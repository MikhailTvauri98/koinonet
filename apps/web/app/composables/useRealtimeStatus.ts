/**
 * Состояние связи в реальном времени. Первый потребитель включает слежение
 * (таймеры повтора, события браузера и сокета), уход последнего выключает.
 */
export function useRealtimeStatus() {
  const store = useRealtimeStore()
  if (import.meta.client) {
    store.attach()
    if (getCurrentScope()) onScopeDispose(() => store.detach())
  }
  const { state, failures } = storeToRefs(store)
  return { state, failures, retry: store.retry }
}
