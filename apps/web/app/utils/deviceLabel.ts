/** Название программы и системы; исходный User-Agent доступен в подробностях устройства. */
export function deviceLabel(userAgent?: string | null): string {
  const agent = userAgent ?? ''
  // Chromium-браузеры и браузеры iOS распознаются до общих Chrome/Safari.
  const browsers: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//i, 'Microsoft Edge'],
    [/(?:OPR|Opera|OPiOS)\//i, 'Opera'],
    [/SamsungBrowser\//i, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\//i, 'Firefox'],
    [/(?:Chrome|CriOS)\//i, 'Chrome'],
    [/Version\/[^ ]+.*Safari\//i, 'Safari'],
  ]
  const systems: [RegExp, string][] = [
    [/(?:iPhone|iPad|iPod)/i, 'iOS'],
    [/Android/i, 'Android'],
    [/Windows/i, 'Windows'],
    [/(?:Macintosh|Mac OS X)/i, 'macOS'],
    [/CrOS/i, 'ChromeOS'],
    [/Linux/i, 'Linux'],
  ]
  const browser = browsers.find(([pattern]) => pattern.test(agent))?.[1] ?? 'Устройство'
  const system = systems.find(([pattern]) => pattern.test(agent))?.[1]
  return system ? browser + ' · ' + system : browser
}
