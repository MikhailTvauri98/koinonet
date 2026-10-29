// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { createEchoFactory } from '~/utils/echo'

const { construct, disconnect } = vi.hoisted(() => ({ construct: vi.fn(), disconnect: vi.fn() }))
vi.mock('laravel-echo', () => ({ default: class { constructor(options: unknown) { construct(options) }; disconnect = disconnect } }))

describe('same-origin lazy Echo', () => {
  it.each([
    ['http:', '3000', 3000, false],
    ['https:', '', 443, true],
    ['http:', '', 80, false],
  ])('uses the loaded public key and page origin (%s %s)', (protocol, port, expectedPort, tls) => {
    construct.mockClear()
    const settings = { loaded: false, reverbKey: '' }
    const post = vi.fn().mockResolvedValue({ auth: 'signed' })
    const factory = createEchoFactory(() => settings, { hostname: 'church.test', protocol, port }, post)
    expect(construct).not.toHaveBeenCalled()
    expect(() => factory()).toThrow()
    settings.loaded = true
    settings.reverbKey = 'loaded-key'
    const instance = factory()
    expect(factory()).toBe(instance)
    expect(construct).toHaveBeenCalledOnce()
    const options = construct.mock.calls[0]![0]
    expect(options).toMatchObject({ broadcaster: 'reverb', key: 'loaded-key', wsHost: 'church.test', wsPort: expectedPort, wssPort: expectedPort, forceTLS: tls, enabledTransports: ['ws', 'wss'] })
    // Pusher itself prepends /app/{key}; adding wsPath=/app duplicates it.
    expect(options.wsPath).toBeUndefined()
    const callback = vi.fn()
    return options.authorizer({ name: 'private-user.u1' }).authorize('1.2', callback).then(() => {
      expect(post).toHaveBeenCalledWith('/broadcasting/auth', { socket_id: '1.2', channel_name: 'private-user.u1' })
      expect(callback).toHaveBeenCalledWith(null, { auth: 'signed' })
    })
  })

  it('passes channel authorization failures to Echo', async () => {
    const failure = new Error('unauthorized')
    const factory = createEchoFactory(() => ({ loaded: true, reverbKey: 'key' }), { hostname: 'church.test', protocol: 'https:', port: '' }, vi.fn().mockRejectedValue(failure))
    factory()
    const callback = vi.fn()
    await construct.mock.lastCall![0].authorizer({ name: 'private-user.u1' }).authorize('1.2', callback)
    expect(callback).toHaveBeenCalledWith(failure, null)
  })
})
