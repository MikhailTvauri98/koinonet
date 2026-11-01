import { describe, expect, it } from 'vitest'
import { deviceLabel } from '../../app/utils/deviceLabel'

describe('deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0', 'Microsoft Edge · Windows'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iOS'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1', 'Chrome · iOS'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox · macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 OPR/115.0', 'Opera · Linux'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Samsung Internet · Android'],
    ['UnknownBrowser/1.0 (Windows NT 10.0)', 'Устройство · Windows'],
    ['Firefox/130.0', 'Firefox'],
    ['Unknown/' + 'x'.repeat(2000), 'Устройство'],
    ['', 'Устройство'], [null, 'Устройство'], [undefined, 'Устройство'],
  ])('labels %s', (agent, label) => expect(deviceLabel(agent)).toBe(label))
})
