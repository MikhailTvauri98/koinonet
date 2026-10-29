// Общая проверка для подсказки установки и включения пушей (ADR-0001).
export function usePlatform() {
  if (typeof navigator === 'undefined') return { isIos: false, isIosSafari: false, isStandalone: false }
  const ua = navigator.userAgent
  // iPadOS может представляться настольным Safari.
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isIosSafari = isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  const isStandalone = (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return { isIos, isIosSafari, isStandalone: Boolean(isStandalone) }
}
