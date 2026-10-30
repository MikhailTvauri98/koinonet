// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'

async function runtime(name: 'docker' | 'native') {
  vi.stubEnv('E2E_API_RUNTIME', name)
  vi.resetModules()
  return import('../../e2e/environment')
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('runs the owned Docker API with CLI OPcache and the same Laravel public router', async () => {
  const { apiRuntime, e2e } = await runtime('docker')
  const server = apiRuntime.longRunning('api')
  expect(server.command).toBe('docker')
  expect(server.container).toBe('church-e2e-api')
  expect(server.args).toContain('--rm')
  for (const value of ['curchcowork.e2e=true', 'DB_DATABASE=church_e2e', 'REDIS_DB=14', 'REDIS_CACHE_DB=15', `127.0.0.1:${e2e.apiPort}:8000`]) {
    expect(server.args).toContain(value)
  }
  expect(server.args).toEqual(expect.arrayContaining(['--workdir', '/app/public']))
  expect(server.args.slice(server.args.indexOf('app') + 1)).toEqual([
    'php', '-d', 'opcache.enable_cli=1', '-d', 'opcache.validate_timestamps=0', '-S', '0.0.0.0:8000',
    '/app/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php',
  ])
})

it('keeps the native CI server command and its guarded environment', async () => {
  const { apiRuntime, e2e } = await runtime('native')
  const server = apiRuntime.longRunning('api')
  expect(server.command).toBe('php')
  expect(server.cwd).toBe(e2e.apiDir)
  expect(server.args).toEqual(['artisan', 'serve', '--no-reload', '--host=127.0.0.1', `--port=${e2e.apiPort}`])
  expect(server.env).toMatchObject({ DB_DATABASE: 'church_e2e', REDIS_DB: '14', REDIS_CACHE_DB: '15' })
})

it('keeps Docker worker and Reverb commands isolated without changing their PHP options', async () => {
  const { apiRuntime } = await runtime('docker')
  for (const role of ['worker', 'reverb'] as const) {
    const server = apiRuntime.longRunning(role)
    expect(server.args).toContain('curchcowork.e2e=true')
    expect(server.args).toContain('DB_DATABASE=church_e2e')
    expect(server.args).toContain('artisan')
    expect(server.args).not.toContain('opcache.enable_cli=1')
    expect(server.args).not.toContain('opcache.validate_timestamps=0')
  }
})
