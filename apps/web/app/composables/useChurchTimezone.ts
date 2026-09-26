// Часовой пояс церкви — `GET /settings`, читается любым вошедшим
// (docs/architecture.md, раздел 8 и 10: "Даты показываются в часовом поясе
// церкви... а не устройства"). Экрану, которому нужны даты (устройства,
// журнал), нужен только сам пояс, не остальные настройки — отдельная
// маленькая функция вместо разбора полного `SettingsResource` в каждом из
// них.
export async function fetchChurchTimezone(): Promise<string> {
  const api = useApi()
  try {
    const response = await api.get<{ data: { timezone?: string } }>('/settings')
    return response.data.timezone ?? 'UTC'
  } catch {
    // Часовой пояс — не критичный для экрана запрос: при сбое даты просто
    // остаются в UTC, а не роняют список устройств или журнал целиком.
    return 'UTC'
  }
}
