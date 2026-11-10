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
        { repo: 'acme/widgets', syncedAt: stored.syncedAt, baseBranch: 'main', people: 1 },
        { repo: 'acme/new', syncedAt: null, baseBranch: null, people: null },
        { repo: 'acme/old', syncedAt: null, baseBranch: null, people: null },
      ],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('#8 AC10: rows carry baseBranch and a people count that excludes bots', async () => {
    await link('acme/widgets')
    const pr = stored.pullRequests[0]
    await writeRepo(
      {
        ...stored,
        pullRequests: [
          pr,
          { ...pr, number: 2, author: 'fake-other' },
          { ...pr, number: 3, author: 'dependabot[bot]', authorIsBot: true },
        ],
        reviews: [
          { id: 'r1', pullRequestNumber: 1, reviewer: 'fake-reviewer', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-05-21T00:00:00Z' },
          { id: 'r2', pullRequestNumber: 1, reviewer: 'ci[bot]', reviewerIsBot: true, outcome: 'commented', submittedAt: '2026-05-21T00:00:00Z' },
        ],
      },
      dir,
    )
    const call = await boot()
    const body = (await (await call('/api/repos')).json()) as { repos: unknown[] }
    expect(body.repos).toEqual([
      { repo: 'acme/widgets', syncedAt: stored.syncedAt, baseBranch: 'main', people: 3 },
    ])
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

  // Superseded by #8: POST /api/repos now adds a repo, so PUT is the unsupported method.
  it('#16 AC1: PUT is 405', async () => {
    const call = await boot()
    expect((await call('/api/repos', { method: 'PUT' })).status).toBe(405)
  })
})

/** Fake GitHub: existence queries and sync queries are told apart by query text. */
function github(opts: { exists?: unknown; syncFails?: boolean; status?: number } = {}) {
  const calls: { query: string; variables: { owner: string; name: string } }[] = []
  const f = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    calls.push(body)
    if (String(body.query).includes('nameWithOwner')) {
      if (opts.status) return new Response('{}', { status: opts.status })
      return new Response(JSON.stringify(opts.exists ?? { data: { repository: { nameWithOwner: `${body.variables.owner}/${body.variables.name}` } } }))
    }
    if (opts.syncFails) throw new Error(`boom ${TOKEN}`)
    return new Response(JSON.stringify(okPage))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  return { f, calls }
}

const post = (call: ReturnType<typeof boot> extends Promise<infer C> ? C : never, input: unknown) =>
  call('/api/repos', { method: 'POST', body: JSON.stringify({ input }) })
const configRepos = async () => JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8')).repos

describe('POST /api/repos', () => {
  it('#8 AC2: every accepted input form is stored canonically, read-only, and persists in config', async () => {
    const forms = [
      'acme/widgets',
      '  github.com/acme/widgets  ',
      'https://github.com/acme/widgets',
      'http://github.com/acme/widgets/',
      'https://github.com/acme/widgets.git',
    ]
    for (const form of forms) {
      await rm(path.join(dir, 'config.json'), { force: true })
      const { f, calls } = github()
      const call = await boot({ token: TOKEN, fetchImpl: f })
      const res = await post(call, form)
      expect(res.status, form).toBe(201)
      expect(await configRepos()).toEqual(['acme/widgets'])
      expect(calls.every((c) => !/\bmutation\b/i.test(c.query))).toBe(true)
      await new Promise<void>((r) => server!.close(() => r()))
      server = undefined
    }
  })

  it('#8 AC2: uses the canonical spelling from GitHub', async () => {
    const { f } = github({ exists: { data: { repository: { nameWithOwner: 'Acme/Widgets' } } } })
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await post(call, 'acme/widgets')
    expect(((await res.json()) as { repo: string }).repo).toBe('Acme/Widgets')
    expect(await configRepos()).toEqual(['Acme/Widgets'])
  })

  it('#8 AC3: invalid_format, case-insensitive duplicate and not found leave config unchanged', async () => {
    await link('Acme/Widgets')
    const { f } = github({ exists: { data: { repository: null }, errors: [{ type: 'NOT_FOUND' }] } })
    const call = await boot({ token: TOKEN, fetchImpl: f })
    for (const bad of ['nope', 'a/b/c', '', 'https://example.com/acme/widgets']) {
      const res = await post(call, bad)
      expect(res.status, bad).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_format' })
    }
    const dup = await post(call, 'acme/widgets')
    expect(dup.status).toBe(409)
    expect(await dup.json()).toEqual({ error: 'duplicate', repo: 'Acme/Widgets' })
    expect(f).not.toHaveBeenCalled()
    const missing = await post(call, 'acme/ghost')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_found_or_no_access' })
    expect(await configRepos()).toEqual(['Acme/Widgets'])
  })

  it('#8 AC3: a forbidden repo is not_found_or_no_access and other failures are 502', async () => {
    const forbidden = github({ status: 403 })
    let call = await boot({ token: TOKEN, fetchImpl: forbidden.f })
    let res = await post(call, 'acme/secret')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found_or_no_access' })
    await new Promise<void>((r) => server!.close(() => r()))
    server = undefined
    const down = github({ status: 500 })
    call = await boot({ token: TOKEN, fetchImpl: down.f })
    res = await post(call, 'acme/secret')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'github_failed' })
    await expect(readFile(path.join(dir, 'config.json'), 'utf8')).rejects.toThrow()
  })

  it('#8 AC12: a successful add returns synced and people, and writes the repo file', async () => {
    const { f } = github()
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await post(call, 'acme/widgets')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ repo: 'acme/widgets', synced: true, people: 0 })
    const file = JSON.parse(await readFile(path.join(dir, 'repos', 'acme__widgets.json'), 'utf8'))
    expect(file.repo).toBe('acme/widgets')
  })

  it('#8 AC12: a sync failure after the existence check keeps the repo linked', async () => {
    const { f } = github({ syncFails: true })
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await post(call, 'acme/widgets')
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ repo: 'acme/widgets', synced: false, code: 'network' })
    expect(text).not.toContain(TOKEN)
    expect(await configRepos()).toEqual(['acme/widgets'])
  })

  it('#8 AC7: no response body contains the token, including missing_token', async () => {
    const call = await boot()
    const res = await post(call, 'acme/widgets')
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'missing_token' })
    expect(text).not.toContain(TOKEN)
    await expect(readFile(path.join(dir, 'config.json'), 'utf8')).rejects.toThrow()
  })

  it('#8 AC2: two parallel POSTs both end up in config', async () => {
    const { f } = github()
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const [a, b] = await Promise.all([post(call, 'acme/one'), post(call, 'acme/two')])
    expect([a.status, b.status]).toEqual([201, 201])
    expect([...(await configRepos())].sort()).toEqual(['acme/one', 'acme/two'])
  })

  it('#8 AC3: an oversized body is 413 and bad JSON or a missing input is 400', async () => {
    const call = await boot({ token: TOKEN })
    const big = await call('/api/repos', {
      method: 'POST',
      body: JSON.stringify({ input: 'a'.repeat(20 * 1024) }),
    })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: 'too_large' })
    for (const body of ['{ nope', JSON.stringify({}), JSON.stringify({ input: 5 })]) {
      const res = await call('/api/repos', { method: 'POST', body })
      expect(res.status, body).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_format' })
    }
  })
})

describe('DELETE /api/repos/:owner/:name', () => {
  it('#8 AC4: removes the config entry and the repo file without calling GitHub', async () => {
    await link('acme/widgets', 'acme/other')
    await writeRepo(stored, dir)
    const f = vi.fn() as unknown as typeof fetch
    vi.stubGlobal('fetch', f)
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await call('/api/repos/acme/widgets', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await configRepos()).toEqual(['acme/other'])
    await expect(readFile(path.join(dir, 'repos', 'acme__widgets.json'), 'utf8')).rejects.toThrow()
    expect(f).not.toHaveBeenCalled()
  })

  it('#8 AC4: a missing repo file still returns 200', async () => {
    await link('acme/widgets')
    const call = await boot()
    const res = await call('/api/repos/acme/widgets', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await configRepos()).toEqual([])
  })

  it('#8 AC4: matches the repo case-insensitively and removes the stored spelling and its file', async () => {
    await link('Acme/Widgets', 'acme/other')
    await writeRepo({ ...stored, repo: 'Acme/Widgets' }, dir)
    const call = await boot()
    const res = await call('/api/repos/acme/widgets', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await configRepos()).toEqual(['acme/other'])
    await expect(readFile(path.join(dir, 'repos', 'Acme__Widgets.json'), 'utf8')).rejects.toThrow()
  })

  it('#8 AC4: a repo that is not linked returns 404 not_linked', async () => {
    await link('acme/other')
    const f = vi.fn() as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await call('/api/repos/acme/widgets', { method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_linked' })
    expect(f).not.toHaveBeenCalled()
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
    expect(await res.json()).toEqual({ ok: true, people: 0 }) // #8 AC5: sync returns people
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
