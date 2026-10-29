import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createPreviewProxy } from './proxy.mjs'

// Ports are supplied by playwright.config.ts from environment.ts.
const [publicPort, previewPort, reverbPort] = process.argv.slice(2).map(Number)
if (![publicPort, previewPort, reverbPort].every(port => Number.isInteger(port) && port > 0 && port < 65536)) {
  throw new Error('Expected public, preview and Reverb ports')
}
mkdirSync('test-results/server', { recursive: true })
const log = createWriteStream('test-results/server/preview.log')
const preview = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(previewPort), NITRO_PORT: String(previewPort) },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
preview.stdout.pipe(log, { end: false })
preview.stderr.pipe(log, { end: false })
const proxy = createPreviewProxy({ previewPort, reverbPort })
let stopping = false
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  await proxy.close()
  preview.kill('SIGTERM')
  log.end()
  process.exitCode = code
}
preview.on('error', (error) => { console.error(error); void stop(1) })
preview.on('exit', (code) => { if (!stopping) void stop(code || 1) })
proxy.server.on('error', (error) => { console.error(error); void stop(1) })
proxy.server.listen(publicPort, '127.0.0.1')
process.on('SIGINT', () => { void stop() })
process.on('SIGTERM', () => { void stop() })
