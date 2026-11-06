// @vitest-environment node
import type { Server } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiRoutes } from './api.ts'
import { createApp } from './app.ts'
import { startServer } from './index.ts'
import { writeRepo } from './store.ts'
import type { StoredRepo } from '../src/api/types.ts'

const TOKEN = 'fake-token-for-tests-7'
const NOW = new Date('2026-06-01T00:00:00Z')
const realFetch = globalThis.fetch

const stored: StoredRepo = {
  schemaVersion: 2,
  repo: 'acme/widgets',
  syncedAt: '2026-06-01T00:00:00.000Z',
  pullRequests: [
    {
      number: 1,
      author: 'fake-author',
      authorIsBot: false,
      state: 'merged',
      createdAt: '2026-05-20T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      mergedAt: '2026-05-25T00:00:00Z',
      closedAt: '2026-05-25T00:00:00Z',
      additions: 5,
      deletions: 2,
      baseBranch: 'main',
      requestedReviewers: [],
    },
  ],
  reviews: [],
}

let dir: string
let server: Server | undefined

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'api-test-'))
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
  server = undefined
  await rm(dir, { recursive: true, force: true })
})

async function boot(opts: { token?: string; fetchImpl?: typeof fetch } = {}) {
  server = await startServer({
    port: 0,
    distDir: path.join(dir, 'dist'),
    apiRoutes: createApiRoutes({
      getToken: () => opts.token,
      dataDir: dir,
      fetchImpl: opts.fetchImpl,
      now: () => NOW,
    }),
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('not listening')
  const base = `http://127.0.0.1:${addr.port}`
  return (p: string, init?: RequestInit) => realFetch(base + p, init)
}

const link = (...repos: string[]) => writeFile(path.join(dir, 'config.json'), JSON.stringify({ repos }))

const gql = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>

const okPage = {
  data: {
    repository: {
      pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    },
  },
}

describe('GET /api/repos', () => {
  it('#16 AC1: lists linked repos in config order with syncedAt, null when unsynced or v1', async () => {
    await link('acme/widgets', 'acme/new', 'acme/old')
    await writeRepo(stored, dir)
    await mkdir(path.join(dir, 'repos'), { recursive: true })
    await writeFile(
      path.join(dir, 'repos', 'acme__old.json'),
      JSON.stringify({ schemaVersion: 1, repo: 'acme/old', syncedAt: '2026-01-01T00:00:00Z' }),
    )
    const fetchSpy = vi.fn(async () => {
      throw new Error('network disabled')
    })
    const call = await boot({ fetchImpl: fetchSpy as unknown as typeof fetch })
    const res = await call('/api/repos')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      repos: [
        { repo: 'acme/widgets', syncedAt: stored.syncedAt },
        { repo: 'acme/new', syncedAt: null },
        { repo: 'acme/old', syncedAt: null },
      ],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('#16 AC4: returns an empty list when there is no config', async () => {
    const call = await boot()
    const res = await call('/api/repos')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ repos: [] })
  })

  it('#16 AC1: invalid config returns 500 config_invalid without the config error text', async () => {
    await writeFile(path.join(dir, 'config.json'), '{ not json')
    const call = await boot()
    const res = await call('/api/repos')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'config_invalid' })
    expect(text).not.toContain('config.json')
  })

  it('#16 AC1: POST is 405', async () => {
    const call = await boot()
    expect((await call('/api/repos', { method: 'POST' })).status).toBe(405)
  })
})

describe('GET /api/data', () => {
  it('#7 AC2: returns the stored data and makes no network request', async () => {
    await writeRepo(stored, dir)
    const fetchSpy = vi.fn(async () => {
      throw new Error('network disabled')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const call = await boot({ fetchImpl: fetchSpy as unknown as typeof fetch })
    const res = await call('/api/data?repo=acme/widgets')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(stored)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('#7 AC2: 400 invalid_repo on a bad format and 404 not_synced when no file', async () => {
    const call = await boot()
    const bad = await call('/api/data?repo=../etc')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_repo' })
    const none = await call('/api/data')
    expect(none.status).toBe(400)
    const missing = await call('/api/data?repo=acme/none')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_synced' })
  })
})

describe('POST /api/repos/:owner/:name/sync', () => {
  it('#7 AC1: syncs a linked repo and stores it', async () => {
    await link('acme/widgets')
    const f = gql(okPage)
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await call('/api/repos/acme/widgets/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const file = JSON.parse(await readFile(path.join(dir, 'repos', 'acme__widgets.json'), 'utf8'))
    expect(file.repo).toBe('acme/widgets')
  })

  it('#7 AC5: an upstream error returns 502 with code and constant message, never the token', async () => {
    await link('acme/widgets')
    const f = vi.fn(async () => {
      throw new Error(`boom ${TOKEN}`)
    }) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await call('/api/repos/acme/widgets/sync', { method: 'POST' })
    expect(res.status).toBe(502)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.ok).toBe(false)
    expect(body.code).toBe('network')
    expect(body.message).toContain('Could not reach GitHub')
    expect(text).not.toContain(TOKEN)
  })

  it('#7 AC5: a repo that is not in config.json returns 404 not_linked without calling GitHub', async () => {
    await link('acme/other')
    const f = gql(okPage)
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await call('/api/repos/acme/widgets/sync', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_linked' })
    expect(f).not.toHaveBeenCalled()
  })

  it('#7 AC5: no token returns 503 with the missing-token message', async () => {
    await link('acme/widgets')
    const call = await boot()
    const res = await call('/api/repos/acme/widgets/sync', { method: 'POST' })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { message: string }).message).toContain('GITHUB_TOKEN')
  })

  it('#7 AC5: GET on the sync route is 405', async () => {
    const call = await boot({ token: TOKEN })
    const res = await call('/api/repos/acme/widgets/sync')
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })
})

describe('createApp route params', () => {
  it('#7 AC8: passes :params to handlers, prefers exact paths and keeps 404 for non-matches', async () => {
    const seen: Record<string, string>[] = []
    const app = createApp({
      distDir: path.join(dir, 'dist'),
      apiRoutes: {
        '/api/items/:id/x': { GET: (_req, res, params) => { seen.push(params); res.end('p') } },
        '/api/items/special/x': { GET: (_req, res) => { res.end('exact') } },
      },
    })
    const { createServer } = await import('node:http')
    server = createServer(app)
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('not listening')
    const get = (p: string) => realFetch(`http://127.0.0.1:${addr.port}${p}`)
    expect(await (await get('/api/items/42/x')).text()).toBe('p')
    expect(seen).toEqual([{ id: '42' }])
    expect(await (await get('/api/items/special/x')).text()).toBe('exact')
    expect((await get('/api/items/42/y')).status).toBe(404)
    expect((await get('/api/items//x')).status).toBe(404)
    await mkdir(dir, { recursive: true })
  })
})
