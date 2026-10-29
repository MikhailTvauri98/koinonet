import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { createPreviewProxy } from './proxy.mjs'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

test('preview proxy forwards HTTP and the unchanged /app WebSocket path, then closes upgraded sockets', async (t) => {
  const preview = createServer((req, res) => res.end(`${req.method} ${req.url} ${req.headers.host}`))
  const previewPort = await listen(preview)
  t.after(() => preview.close())
  let upgradePath
  const reverb = createServer()
  reverb.on('upgrade', (req, socket, head) => {
    upgradePath = req.url
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nwelcome')
    if (head.length) socket.write(head)
    socket.on('data', bytes => socket.write(bytes))
  })
  const reverbPort = await listen(reverb)
  t.after(() => reverb.close())
  const proxy = createPreviewProxy({ previewPort, reverbPort })
  const publicPort = await listen(proxy.server)
  t.after(() => proxy.close())
  const response = await fetch(`http://127.0.0.1:${publicPort}/api/v1/health`)
  assert.equal(await response.text(), `GET /api/v1/health 127.0.0.1:${publicPort}`)
  const warnings = []
  const collectWarning = warning => warnings.push(warning.name)
  process.on('warning', collectWarning)
  t.after(() => process.off('warning', collectWarning))
  for (let index = 0; index < 15; index++) {
    const repeated = await fetch(`http://127.0.0.1:${publicPort}/api/v1/health`)
    await repeated.text()
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(warnings, [], 'keepalive reuse does not accumulate socket listeners')

  const upgrade = request({ hostname: '127.0.0.1', port: publicPort, path: '/app/test-key?protocol=7', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } })
  const upgraded = once(upgrade, 'upgrade')
  upgrade.end()
  const [res, socket, head] = await upgraded
  assert.equal(res.statusCode, 101)
  assert.equal(upgradePath, '/app/test-key?protocol=7')
  const greeting = head.length ? head.toString() : (await once(socket, 'data'))[0].toString()
  assert.equal(greeting, 'welcome')
  const echo = once(socket, 'data')
  socket.write('real socket bytes')
  assert.equal((await echo)[0].toString(), 'real socket bytes')
  const closed = once(socket, 'close')
  socket.resume()
  await proxy.close()
  await closed
  assert.equal(proxy.server.listening, false)
})

test('preview proxy returns a bounded failure for an unavailable upstream and rejects other upgrade paths', async (t) => {
  const unused = createServer()
  const port = await listen(unused)
  await new Promise(resolve => unused.close(resolve))
  const proxy = createPreviewProxy({ previewPort: port, reverbPort: port })
  const publicPort = await listen(proxy.server)
  t.after(() => proxy.close())
  assert.equal((await fetch(`http://127.0.0.1:${publicPort}/`)).status, 502)
  const rejected = request({ hostname: '127.0.0.1', port: publicPort, path: '/other', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } })
  const response = once(rejected, 'response')
  rejected.end()
  assert.equal((await response)[0].statusCode, 404)
})
