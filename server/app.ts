import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>

/** Maps an `/api/...` path to handlers keyed by upper-case HTTP method. */
export type ApiRoutes = Record<string, Partial<Record<string, RouteHandler>>>

export interface AppOptions {
  distDir: string
  apiRoutes?: ApiRoutes
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

function hostnameOf(hostHeader: string): string | undefined {
  try {
    return new URL(`http://${hostHeader}`).hostname
  } catch {
    return undefined
  }
}

function isLocalHostname(hostname: string | undefined): boolean {
  return hostname !== undefined && LOCAL_HOSTNAMES.has(hostname)
}

function passesGuard(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (!host || !isLocalHostname(hostnameOf(host))) return false
  const origin = req.headers.origin
  if (origin !== undefined) {
    let originHost: string | undefined
    try {
      originHost = new URL(origin).hostname
    } catch {
      return false
    }
    if (!isLocalHostname(originHost)) return false
  }
  return true
}

function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
): Promise<void> {
  const data = await readFile(file)
  const type =
    CONTENT_TYPES[path.extname(file).toLowerCase()] ??
    'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length })
  res.end(req.method === 'HEAD' ? undefined : data)
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
  pathname: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' })
    return
  }
  const root = path.resolve(distDir)
  const indexFile = path.join(root, 'index.html')

  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    sendText(res, 404, 'Not found')
    return
  }
  if (decoded.includes('\0')) {
    sendText(res, 404, 'Not found')
    return
  }
  const target = path.resolve(root, '.' + path.sep + decoded)
  if (target !== root && !target.startsWith(root + path.sep)) {
    sendText(res, 404, 'Not found')
    return
  }

  if (target !== root && (await isFile(target))) {
    await serveFile(req, res, target)
    return
  }

  if (path.extname(decoded) === '') {
    if (await isFile(indexFile)) {
      await serveFile(req, res, indexFile)
      return
    }
    sendText(res, 503, 'Build the app first: npm run build')
    return
  }
  sendText(res, 404, 'Not found')
}

export function createApp(
  options: AppOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const apiRoutes = options.apiRoutes ?? {}

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!passesGuard(req)) {
      sendText(res, 403, 'Forbidden')
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const methods = Object.hasOwn(apiRoutes, pathname)
        ? apiRoutes[pathname]
        : undefined
      if (!methods) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      const handler = methods[req.method ?? '']
      if (!handler) {
        res.setHeader('Allow', Object.keys(methods).join(', '))
        sendJson(res, 405, { error: 'method_not_allowed' })
        return
      }
      await handler(req, res)
      return
    }
    await serveStatic(req, res, options.distDir, pathname)
  }

  return (req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'Internal server error')
      else res.end()
    })
  }
}
