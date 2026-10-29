import type { components } from '~~/types/api'
import { useApi } from '~/composables/useApi'

type Settings = components['schemas']['SettingsResource']

export const useSettingsStore = defineStore('settings', () => {
  const churchName = ref('')
  const timezone = ref('UTC')
  const vapidPublicKey = ref('')
  const reverbKey = ref('')
  const loaded = ref(false)
  let generation = 0
  let pending: Promise<void> | undefined

  function apply(data: Settings) {
    churchName.value = data.church_name
    timezone.value = data.timezone ?? 'UTC'
    vapidPublicKey.value = data.vapid_public_key ?? ''
    reverbKey.value = data.reverb_key ?? ''
    loaded.value = true
  }

  function fetch(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (pending) return pending
    const version = generation
    const api = useApi()
    pending = (async () => {
      try {
        const response = await api.get<{ data: Settings }>('/settings')
        if (version === generation) apply(response.data)
      } finally {
        if (version === generation) pending = undefined
      }
    })()
    return pending
  }

  function reset() {
    generation++
    pending = undefined
    churchName.value = ''
    timezone.value = 'UTC'
    vapidPublicKey.value = ''
    reverbKey.value = ''
    loaded.value = false
  }

  return { churchName, timezone, vapidPublicKey, reverbKey, loaded, fetch, apply, reset }
})
