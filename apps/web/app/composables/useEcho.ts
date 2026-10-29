export function useEcho() {
  return useNuxtApp().$echo(useSettingsStore(), useApi().post)
}
