export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

export function subscriptionPayload(subscription: PushSubscriptionJSON) {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
    throw new Error('Incomplete push subscription')
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    content_encoding: 'aes128gcm',
  }
}
