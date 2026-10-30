import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

// Timers are capped at one minute (including year 9999), avoiding the native
// timeout overflow. Refresh immediately after a suspended tab becomes visible.
export function useChatMuted(until: MaybeRefOrGetter<string | null | undefined>) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setTimeout> | undefined
  const muted = computed(() => Date.parse(toValue(until) ?? '') > now.value)
  function update() {
    if (timer) clearTimeout(timer)
    timer = undefined; now.value = Date.now()
    const remaining = Date.parse(toValue(until) ?? '') - now.value
    if (remaining > 0) timer = setTimeout(update, Math.min(remaining, 60000))
  }
  watch(() => toValue(until), update)
  onMounted(() => { update(); document.addEventListener('visibilitychange', update) })
  onBeforeUnmount(() => { if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', update) })
  return muted
}
