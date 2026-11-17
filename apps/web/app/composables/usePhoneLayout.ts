/** Макет телефона: ниже 1024 px (там список по умолчанию). Реактивен, слушает смену размера окна. */
const PHONE_QUERY = '(max-width: 1023px)'
export function usePhoneLayout() {
  const media = import.meta.client && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null
  const phone = ref(!!media?.matches)
  const sync = () => { phone.value = !!media?.matches }
  media?.addEventListener?.('change', sync)
  onScopeDispose(() => media?.removeEventListener?.('change', sync))
  return phone
}
