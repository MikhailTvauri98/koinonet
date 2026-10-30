export interface PushPayload { title?: string, body?: string, icon?: string, tag?: string, url?: string, category?: string }
export interface WindowLike { url: string, focus: () => unknown, navigate: (url: string) => unknown }

export function safePath(url: string, origin: string): string | null {
  try {
    const target = new URL(url, origin)
    return target.origin === origin ? target.pathname + target.search + target.hash : null
  } catch { return null }
}

export function chatTarget(payload: PushPayload, origin: string): string | null {
  if (payload.category !== 'chat' || !payload.url) return null
  const path = safePath(payload.url, origin)
  const id = path?.match(/^\/chats\/([A-Za-z0-9_-]+)$/)?.[1]
  return id && payload.tag === `chat-${id}` ? id : null
}

export function shouldShow(payload: PushPayload, openUrls: readonly string[], origin: string): boolean {
  const id = chatTarget(payload, origin)
  return !id || !openUrls.some(url => safePath(url, origin) === `/chats/${id}`)
}

export function notificationOptions(payload: PushPayload): NotificationOptions & { title: string, renotify: boolean } {
  return {
    title: payload.title ?? 'Церковь',
    body: payload.body ?? '',
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag,
    // Без непустого tag браузер отклоняет showNotification с renotify=true.
    renotify: Boolean(payload.tag),
    data: { url: payload.url ?? '/' },
  }
}

export function pickWindow(clients: readonly WindowLike[], url: string): WindowLike | null {
  return clients.find(client => {
    try {
      const current = new URL(client.url)
      const target = new URL(url, client.url)
      return current.href === target.href || (current.origin === target.origin
        && /^\/chats\/[A-Za-z0-9_-]+$/.test(target.pathname) && current.pathname === target.pathname)
    } catch { return false }
  }) ?? clients[0] ?? null
}
