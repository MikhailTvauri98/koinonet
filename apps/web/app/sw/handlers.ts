export interface PushPayload { title?: string, body?: string, icon?: string, tag?: string, url?: string }
export interface WindowLike { url: string, focus: () => unknown, navigate: (url: string) => unknown }

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
      return new URL(client.url).href === new URL(url, client.url).href
    } catch { return false }
  }) ?? clients[0] ?? null
}
