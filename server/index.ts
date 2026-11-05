import { createServer } from 'node:http'
import type { Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import type { AppOptions } from './app.ts'

const BIND_HOST = '127.0.0.1'

export interface StartOptions extends AppOptions {
  port: number
}

export function startServer({ port, ...appOptions }: StartOptions): Promise<Server> {
  const server = createServer(createApp(appOptions))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, BIND_HOST, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const port = Number(process.env.SERVER_PORT ?? 8787)
  const distDir = path.resolve(import.meta.dirname, '..', 'dist')
  const server = await startServer({ port, distDir })
  const address = server.address()
  const actual = typeof address === 'object' && address ? address.port : port
  console.log(`Listening on http://${BIND_HOST}:${actual}`)
}
