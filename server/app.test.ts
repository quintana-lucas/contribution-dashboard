// @vitest-environment node
import { request } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startServer } from './index.ts'

interface Res {
  status: number
  type: string
  body: string
}

let server: Server | undefined
let tmp: string
let distDir: string

function port(): number {
  const a = server?.address()
  if (!a || typeof a === 'string') throw new Error('not listening')
  return a.port
}

function get(
  rawPath: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: port(), path: rawPath, method, headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'cd-server-'))
  distDir = path.join(tmp, 'dist')
  await mkdir(path.join(distDir, 'assets'), { recursive: true })
  await writeFile(path.join(distDir, 'index.html'), '<html>shell</html>')
  await writeFile(path.join(distDir, 'assets', 'x.js'), 'console.log(1)')
  await writeFile(path.join(tmp, 'secret.txt'), 'outside')
})

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
  server = undefined
  await rm(tmp, { recursive: true, force: true })
})

describe('AC11: bind and Host/Origin guard', () => {
  it('AC11: binds to 127.0.0.1 only', async () => {
    server = await startServer({ port: 0, distDir })
    const a = server.address()
    expect(typeof a === 'object' && a?.address).toBe('127.0.0.1')
  })

  it('AC11: rejects a foreign Host with 403', async () => {
    server = await startServer({ port: 0, distDir })
    const res = await get('/', { Host: 'evil.example' })
    expect(res.status).toBe(403)
  })

  it('AC11: rejects a foreign Origin with 403', async () => {
    server = await startServer({ port: 0, distDir })
    const res = await get('/', { Origin: 'http://evil.example' })
    expect(res.status).toBe(403)
  })

  it('AC11: rejects userinfo/delimiter tricks in Host and Origin', async () => {
    server = await startServer({ port: 0, distDir })
    for (const host of [
      'evil.example@localhost',
      'localhost@evil.example',
      'localhost/evil',
      'localhost\\evil',
      'localhost evil',
    ]) {
      expect((await get('/', { Host: host })).status).toBe(403)
    }
    const h = `localhost:${port()}`
    expect(
      (await get('/', { Host: h, Origin: 'http://evil.example@localhost' }))
        .status,
    ).toBe(403)
  })

  it('AC11: allows localhost and 127.0.0.1 Hosts, with or without a localhost Origin', async () => {
    server = await startServer({ port: 0, distDir })
    for (const host of ['localhost', '127.0.0.1']) {
      const h = `${host}:${port()}`
      expect((await get('/', { Host: h })).status).toBe(200)
      expect(
        (await get('/', { Host: h, Origin: `http://${h}` })).status,
      ).toBe(200)
    }
  })
})

describe('AC9: /api/token-status', () => {
  const FAKE = 'fake-token-for-tests-5'

  it('AC9: returns exactly {"configured":true} with a token, never the token', async () => {
    server = await startServer({ port: 0, distDir, tokenConfigured: () => true })
    const res = await get('/api/token-status')
    expect(res.status).toBe(200)
    expect(res.type).toContain('application/json')
    expect(res.body).toBe('{"configured":true}')
    expect(res.body).not.toContain(FAKE)
  })

  it('AC9: returns exactly {"configured":false} without a token', async () => {
    server = await startServer({ port: 0, distDir, tokenConfigured: () => false })
    expect((await get('/api/token-status')).body).toBe('{"configured":false}')
  })

  it('AC9: POST is rejected with 405', async () => {
    server = await startServer({ port: 0, distDir })
    expect((await get('/api/token-status', {}, 'POST')).status).toBe(405)
  })
})

describe('AC2: server without a token', () => {
  it('AC2: still serves index.html', async () => {
    server = await startServer({ port: 0, distDir, tokenConfigured: () => false })
    expect((await get('/')).body).toBe('<html>shell</html>')
  })
})

describe('AC12: static dist and /api', () => {
  it('AC12: serves index.html for / and SPA routes, and JS with a JS type', async () => {
    server = await startServer({ port: 0, distDir })
    expect((await get('/')).body).toBe('<html>shell</html>')
    expect((await get('/some/route')).body).toBe('<html>shell</html>')
    const js = await get('/assets/x.js')
    expect(js.status).toBe(200)
    expect(js.type).toContain('javascript')
  })

  it('AC12: unknown /api path returns 404 JSON', async () => {
    server = await startServer({ port: 0, distDir })
    const res = await get('/api/unknown')
    expect(res.status).toBe(404)
    expect(res.type).toContain('application/json')
    expect(JSON.parse(res.body)).toEqual({ error: 'not_found' })
  })

  it('AC12: known /api path with the wrong method returns 405', async () => {
    server = await startServer({
      port: 0,
      distDir,
      apiRoutes: { '/api/ping': { GET: (_req, res) => void res.end('pong') } },
    })
    expect((await get('/api/ping')).status).toBe(200)
    expect((await get('/api/ping', {}, 'POST')).status).toBe(405)
  })

  it('AC12: does not escape the dist dir', async () => {
    server = await startServer({ port: 0, distDir })
    for (const p of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/..%5c..%5csecret.txt',
    ]) {
      const res = await get(p)
      expect(res.body).not.toContain('outside')
      expect(res.status).toBe(404)
    }
  })

  it('AC12: returns 503 when index.html is missing', async () => {
    await rm(path.join(distDir, 'index.html'))
    server = await startServer({ port: 0, distDir })
    const res = await get('/')
    expect(res.status).toBe(503)
    expect(res.body).toContain('npm run build')
  })

  it('AC12: static rejects non GET/HEAD methods with 405', async () => {
    server = await startServer({ port: 0, distDir })
    expect((await get('/', {}, 'POST')).status).toBe(405)
  })
})
