import type Echo from 'laravel-echo'

// Route transitions can mount another view of the same chat before the old one
// unmounts. Only the final owner may leave; each owner removes its own listeners.
const owners = new WeakMap<object, Map<string, number>>()
export function acquireChatChannel(echo: Echo<'reverb'>, id: string) {
  let channels = owners.get(echo)
  if (!channels) { channels = new Map(); owners.set(echo, channels) }
  const name = `chat.${id}`
  const channel = echo.private(name)
  channels.set(name, (channels.get(name) ?? 0) + 1)
  let released = false
  return { channel, release() {
    if (released) return
    released = true
    const count = (channels.get(name) ?? 1) - 1
    if (count) channels.set(name, count)
    else { channels.delete(name); echo.leave(name) }
  } }
}
