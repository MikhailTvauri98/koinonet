// Файл одного события: тот же источник и cookie-сессия, без отдельного адреса и токена.
export function eventIcsUrl(eventId: string): string {
  return `/api/v1/events/${encodeURIComponent(eventId)}/ics`
}
