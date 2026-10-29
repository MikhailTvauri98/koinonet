import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

type BroadcastAuth = { auth: string }
export type Authorize = (path: string, body: Record<string, unknown>) => Promise<BroadcastAuth>
export type EchoSettings = { loaded: boolean, reverbKey: string }

/** No socket is constructed until the authenticated settings request has completed. */
export function createEchoFactory(
  settings: () => EchoSettings,
  location: Pick<Location, 'hostname' | 'port' | 'protocol'>,
  post: Authorize,
) {
  let echo: Echo<'reverb'> | undefined
  let key: string | undefined
  return () => {
    const current = settings()
    if (!current.loaded || !current.reverbKey) throw new Error('Настройки соединения ещё не загружены.')
    if (echo && key === current.reverbKey) return echo
    echo?.disconnect()
    key = current.reverbKey
    const secure = location.protocol === 'https:'
    const port = Number(location.port || (secure ? 443 : 80))
    echo = new Echo({
      broadcaster: 'reverb',
      Pusher,
      key,
      wsHost: location.hostname,
      wsPort: port,
      wssPort: port,
      forceTLS: secure,
      enabledTransports: ['ws', 'wss'],
      // Pusher's URL builder supplies /app/{key}; wsPath is an extra prefix.
      authorizer: (channel: { name: string }) => ({
        authorize: (socketId: string, callback: (error: Error | null, data: BroadcastAuth | null) => void) =>
          post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
            .then(data => callback(null, data))
            .catch((error: Error) => callback(error, null)),
      }),
    })
    return echo
  }
}
