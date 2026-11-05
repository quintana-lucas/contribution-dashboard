import { createServer } from 'node:http'
import type { Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiRoutes } from './api.ts'
import { createApp } from './app.ts'
import type { AppOptions } from './app.ts'
import { readToken } from './config.ts'
import { validateToken } from './github.ts'
import { GITHUB_UNREACHABLE, INVALID_TOKEN, MISSING_TOKEN } from './messages.ts'
import { createLogger } from './redact.ts'

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
  const token = readToken()
  const log = createLogger(token)
  const port = Number(process.env.SERVER_PORT ?? 8787)
  const distDir = path.resolve(import.meta.dirname, '..', 'dist')
  if (!token) log.warn(MISSING_TOKEN)
  const server = await startServer({
    port,
    distDir,
    tokenConfigured: () => token !== undefined,
    apiRoutes: createApiRoutes({ getToken: () => token }),
  })
  const address = server.address()
  const actual = typeof address === 'object' && address ? address.port : port
  log.info(`Listening on http://${BIND_HOST}:${actual}`)
  if (token) {
    const result = await validateToken(token)
    if (result === 'valid') log.info('GitHub token OK')
    else if (result === 'invalid') log.error(INVALID_TOKEN)
    else log.warn(GITHUB_UNREACHABLE)
  }
}
