import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// A loopback-only deployment simulation. It serves the real generated output;
// only an inert worker comment changes between deployments, never product code.
export async function generatedSite() {
  const root = resolve(process.cwd(), '.output/public')
  await readFile(resolve(root, 'sw.js'))
  let revision = 1
  const servedWorkers: number[] = []
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
      let file = resolve(root, '.' + pathname)
      if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return }
      try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html') }
      catch { if (!extname(pathname)) file = resolve(root, 'index.html') }
      let body = await readFile(file)
      if (pathname === '/sw.js') {
        servedWorkers.push(revision)
        body = Buffer.concat([body, Buffer.from(`\n// acceptance deployment revision ${revision}\n`)])
      }
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' })
      response.end(body)
    } catch { response.writeHead(404).end('Not found') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing generated-site port')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    servedWorkers,
    deploy() { revision++ },
    async close() { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) },
  }
}
