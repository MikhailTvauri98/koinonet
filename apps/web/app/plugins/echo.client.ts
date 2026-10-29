import { createEchoFactory, type Authorize, type EchoSettings } from '~/utils/echo'

export default defineNuxtPlugin(() => {
  let factory: ReturnType<typeof createEchoFactory> | undefined
  return { provide: { echo: (settings: EchoSettings, post: Authorize) => {
    factory ??= createEchoFactory(() => settings, window.location, post)
    return factory()
  } } }
})
