import { createServer, request } from 'node:http'

/** @param {{ previewPort: number, reverbPort: number }} ports */
export function createPreviewProxy({ previewPort, reverbPort }) {
  /** @type {Set<import('node:stream').Duplex>} */
  const sockets = new Set()
  /** @param {import('node:stream').Duplex} socket */
  const track = (socket) => {
    if (sockets.has(socket)) return
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const server = createServer((req, res) => {
    const upstream = request({ hostname: '127.0.0.1', port: previewPort, method: req.method, path: req.url, headers: req.headers }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(res)
    })
    upstream.on('socket', track)
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview unavailable') })
    upstream.setTimeout(30_000, () => upstream.destroy())
    req.on('aborted', () => upstream.destroy())
    req.pipe(upstream)
  })
  server.on('connection', track)
  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/app/')) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    // Preserve /app/{key}; Pusher already supplied the prefix.
    const upstream = request({ hostname: '127.0.0.1', port: reverbPort, path: req.url, headers: req.headers })
    upstream.on('socket', track)
    upstream.on('error', () => socket.destroy())
    upstream.setTimeout(30_000, () => upstream.destroy())
    socket.once('close', () => upstream.destroy())
    upstream.on('response', (response) => {
      socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Upstream rejected upgrade\r\nConnection: close\r\n\r\n`)
      response.resume()
    })
    upstream.on('upgrade', (response, target, targetHead) => {
      const headers = response.rawHeaders.reduce((lines, value, index, all) => index % 2 ? lines : `${lines}${value}: ${all[index + 1]}\r\n`, '')
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n`)
      if (targetHead.length) socket.write(targetHead)
      if (head.length) target.write(head)
      socket.pipe(target).pipe(socket)
      target.once('close', () => socket.destroy())
      socket.once('close', () => target.destroy())
    })
    upstream.end()
  })
  return {
    server,
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy()
      server.close(resolve)
    }),
  }
}
