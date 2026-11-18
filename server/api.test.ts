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
  schemaVersion: 3,
  repo: 'acme/widgets',
  syncedAt: '2026-06-01T00:00:00.000Z',
  pullRequests: [
    {
      number: 1,
      title: 'Fake title',
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

describe('#35 corrupt or unreadable repo files', () => {
  const badFile = async (name: string, content: string) => {
    await mkdir(path.join(dir, 'repos'), { recursive: true })
    await writeFile(path.join(dir, 'repos', `${name}.json`), content)
  }
  // A directory in place of the file makes readFile fail with EISDIR on every platform.
  const unreadable = (name: string) => mkdir(path.join(dir, 'repos', `${name}.json`), { recursive: true })

  it('#35 AC1: invalid JSON is reported as invalid_json, not as not synced', async () => {
    await link('acme/bad')
    await badFile('acme__bad', '{ not json')
    const call = await boot()
    const body = (await (await call('/api/repos')).json()) as { repos: Array<Record<string, unknown>> }
    expect(body.repos[0]).toMatchObject({ repo: 'acme/bad', syncedAt: null, fileError: 'invalid_json' })
    const data = await call('/api/data?repo=acme/bad')
    expect(data.status).toBe(500)
    expect(await data.json()).toEqual({ error: 'invalid_json' })
  })

  it('#35 AC2: an unreadable file is reported as unreadable, distinct from invalid_json', async () => {
    await link('acme/locked')
    await unreadable('acme__locked')
    const call = await boot()
    const body = (await (await call('/api/repos')).json()) as { repos: Array<Record<string, unknown>> }
    expect(body.repos[0]).toMatchObject({ repo: 'acme/locked', fileError: 'unreadable' })
    const data = await call('/api/data?repo=acme/locked')
    expect(await data.json()).toEqual({ error: 'unreadable' })
  })

  it('#35 AC3: healthy repos are returned unchanged next to a bad one', async () => {
    await link('acme/widgets', 'acme/bad', 'acme/new')
    await writeRepo(stored, dir)
    await badFile('acme__bad', '{')
    const call = await boot()
    const res = await call('/api/repos')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { repos: Array<Record<string, unknown>> }
    expect(body.repos[0]).toEqual({ repo: 'acme/widgets', syncedAt: stored.syncedAt, baseBranch: 'main', people: 1 })
    expect(body.repos[1]).toMatchObject({ repo: 'acme/bad', fileError: 'invalid_json' })
    expect(body.repos[2]).toEqual({ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null })
  })

  it('#35 AC5: responses contain no file path and no file contents', async () => {
    await link('acme/bad', 'acme/locked')
    await badFile('acme__bad', 'SECRET-CONTENT-123 {')
    await unreadable('acme__locked')
    const call = await boot()
    const texts = [
      await (await call('/api/repos')).text(),
      await (await call('/api/data?repo=acme/bad')).text(),
      await (await call('/api/data?repo=acme/locked')).text(),
    ].join('\n')
    expect(texts).not.toContain('SECRET-CONTENT')
    expect(texts).not.toContain(dir)
    expect(texts).not.toContain('acme__')
    expect(texts).not.toContain('.json')
  })
})

describe('#56 /api/team damaged repo files', () => {
  const badFile = async (name: string, content: string) => {
    await mkdir(path.join(dir, 'repos'), { recursive: true })
    await writeFile(path.join(dir, 'repos', `${name}.json`), content)
  }
  const unreadable = (name: string) => mkdir(path.join(dir, 'repos', `${name}.json`), { recursive: true })
  type TeamBody = { anySynced: boolean; candidates: unknown[]; damagedRepos?: unknown }

  it('#56 AC1: invalid JSON is identified as damaged with kind invalid_json', async () => {
    await link('acme/bad')
    await badFile('acme__bad', '{ not json')
    const call = await boot()
    const res = await call('/api/team')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      anySynced: false,
      damagedRepos: [{ repo: 'acme/bad', fileError: 'invalid_json' }],
    })
  })

  it('#56 AC2: an unreadable file is identified as unreadable', async () => {
    await link('acme/locked')
    await unreadable('acme__locked')
    const call = await boot()
    const body = (await (await call('/api/team')).json()) as TeamBody
    expect(body.damagedRepos).toEqual([{ repo: 'acme/locked', fileError: 'unreadable' }])
  })

  it('#56 AC3: only the #35 kinds are used', async () => {
    await link('acme/bad', 'acme/locked')
    await badFile('acme__bad', '{')
    await unreadable('acme__locked')
    const call = await boot()
    const body = (await (await call('/api/team')).json()) as { damagedRepos: Array<{ fileError: string }> }
    expect(body.damagedRepos.map((d) => d.fileError)).toEqual(['invalid_json', 'unreadable'])
  })

  it('#56 AC4: the response contains no file path, file name or content', async () => {
    await link('acme/bad', 'acme/locked')
    await badFile('acme__bad', 'SECRET-CONTENT-123 {')
    await unreadable('acme__locked')
    const call = await boot()
    const text = await (await call('/api/team')).text()
    expect(text).not.toContain('SECRET-CONTENT')
    expect(text).not.toContain(dir)
    expect(text).not.toContain('acme__')
    expect(text).not.toContain('.json')
  })

  it('#56 AC5: healthy repos still contribute next to a damaged one', async () => {
    await link('acme/bad', 'acme/widgets')
    await writeRepo(stored, dir)
    await badFile('acme__bad', '{')
    const call = await boot()
    const body = (await (await call('/api/team')).json()) as TeamBody
    expect(body.anySynced).toBe(true)
    expect(body.damagedRepos).toEqual([{ repo: 'acme/bad', fileError: 'invalid_json' }])
  })

  it('#56 AC6: a never-synced repo is not reported as an error', async () => {
    await link('acme/new')
    const call = await boot()
    const body = (await (await call('/api/team')).json()) as TeamBody
    expect(body.anySynced).toBe(false)
    expect(body).not.toHaveProperty('damagedRepos')
  })
})

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

  it('#61 AC4: /api/data returns every review outcome unchanged', async () => {
    const outcomes = ['approved', 'changes_requested', 'commented', 'dismissed'] as const
    await writeRepo(
      {
        ...stored,
        reviews: outcomes.map((outcome, i) => ({
          id: `r${i + 1}`,
          pullRequestNumber: 1,
          reviewer: 'fake-reviewer',
          reviewerIsBot: false,
          outcome,
          submittedAt: '2026-05-21T00:00:00Z',
        })),
      },
      dir,
    )
    const call = await boot()
    const body = (await (await call('/api/data?repo=acme/widgets')).json()) as StoredRepo
    expect(body.reviews.map((r) => [r.id, r.outcome])).toEqual([
      ['r1', 'approved'],
      ['r2', 'changes_requested'],
      ['r3', 'commented'],
      ['r4', 'dismissed'],
    ])
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

describe('#65 /api/sync (all repos)', () => {
  type Call = Awaited<ReturnType<typeof boot>>
  const state = async (call: Call) => (await call('/api/sync')).json() as Promise<{
    running: boolean
    total: number
    index: number
    current: string | null
    results: Array<{ repo: string; ok: boolean; code?: string }>
  }>
  const settle = async (call: Call) => {
    for (let i = 0; i < 200; i++) {
      const s = await state(call)
      if (!s.running) return s
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('sync did not finish')
  }
  const start = (call: Call) => call('/api/sync', { method: 'POST' })
  const fileOf = (repo: string) => path.join(dir, 'repos', `${repo.replace('/', '__')}.json`)

  it('#65 AC1: POST answers 202, syncs every linked repo and GET reports the finished run', async () => {
    await link('acme/one', 'acme/two')
    const f = gql(okPage)
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await start(call)
    expect(res.status).toBe(202)
    const done = await settle(call)
    expect(done).toEqual({
      running: false,
      total: 2,
      index: 2,
      current: null,
      results: [
        { repo: 'acme/one', ok: true },
        { repo: 'acme/two', ok: true },
      ],
    })
    expect(JSON.parse(await readFile(fileOf('acme/one'), 'utf8')).repo).toBe('acme/one')
    expect(JSON.parse(await readFile(fileOf('acme/two'), 'utf8')).repo).toBe('acme/two')
  })

  it('#65 AC1: GET before any run is idle', async () => {
    const call = await boot({ token: TOKEN })
    expect(await state(call)).toEqual({ running: false, total: 0, index: 0, current: null, results: [] })
  })

  it('#65 AC3: a second POST while running is 409 already_running and starts no second run', async () => {
    await link('acme/one')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = vi.fn(async () => {
      await gate
      return new Response(JSON.stringify(okPage))
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const [a, b] = await Promise.all([start(call), start(call)])
    expect([a.status, b.status].sort()).toEqual([202, 409])
    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toEqual({ error: 'already_running' })
    const mid = await state(call)
    expect(mid.running).toBe(true)
    expect(mid.total).toBe(1)
    expect(mid.current).toBe('acme/one')
    expect(mid.index).toBe(1)
    release()
    await settle(call)
    // One repo = two GraphQL queries (open and closed states); a second run would double it.
    expect(f).toHaveBeenCalledTimes(2)
    // Lock released: a new run is accepted.
    expect((await start(call)).status).toBe(202)
    await settle(call)
  })

  it('#65 AC3: the per-repo POST is 409 already_running during a global run', async () => {
    await link('acme/one')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = vi.fn(async () => {
      await gate
      return new Response(JSON.stringify(okPage))
    }) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    await start(call)
    const res = await call('/api/repos/acme/one/sync', { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_running' })
    release()
    await settle(call)
  })

  it('#65 AC5: a failing repo does not stop the others and is reported with only its code', async () => {
    await link('acme/bad', 'acme/good')
    const f = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.variables.name === 'bad') return new Response(`secret github body ${TOKEN}`, { status: 500 })
      return new Response(JSON.stringify(okPage))
    }) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    await start(call)
    const done = await settle(call)
    expect(done.results).toHaveLength(2)
    expect(done.results[0]).toMatchObject({ repo: 'acme/bad', ok: false })
    expect(typeof done.results[0].code).toBe('string')
    expect(Object.keys(done.results[0]).sort()).toEqual(['code', 'ok', 'repo'])
    expect(done.results[1]).toEqual({ repo: 'acme/good', ok: true })
    expect(JSON.parse(await readFile(fileOf('acme/good'), 'utf8')).repo).toBe('acme/good')
  })

  it('#65 AC6: a failed repo keeps its previously stored file untouched', async () => {
    await link('acme/widgets')
    await writeRepo(stored, dir)
    const before = await readFile(fileOf('acme/widgets'), 'utf8')
    const f = vi.fn(async () => {
      throw new Error(`boom ${TOKEN}`)
    }) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    await start(call)
    const done = await settle(call)
    expect(done.results).toEqual([{ repo: 'acme/widgets', ok: false, code: 'network' }])
    expect(await readFile(fileOf('acme/widgets'), 'utf8')).toBe(before)
  })

  it('#65 AC7: no token is 503 missing_token and no run starts', async () => {
    await link('acme/one')
    const f = gql(okPage)
    const call = await boot({ fetchImpl: f })
    const res = await start(call)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('missing_token')
    expect(body.message).toContain('GITHUB_TOKEN')
    expect(f).not.toHaveBeenCalled()
    expect((await state(call)).running).toBe(false)
  })

  it('#65 AC1: no linked repos starts no run (400 no_repos)', async () => {
    const f = gql(okPage)
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const res = await start(call)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'no_repos' })
    expect(f).not.toHaveBeenCalled()
    expect((await state(call)).running).toBe(false)
  })

  it('#65 AC9 AC10: no response body contains the token or raw GitHub text, including failures', async () => {
    await link('acme/one', 'acme/two')
    const f = vi.fn(async () => new Response(`RAW-GITHUB-TEXT ${TOKEN}`, { status: 401 })) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    const bodies: string[] = []
    const res = await start(call)
    bodies.push(await res.text())
    for (let i = 0; i < 200; i++) {
      const r = await call('/api/sync')
      const text = await r.text()
      bodies.push(text)
      if (!(JSON.parse(text) as { running: boolean }).running) break
      await new Promise((r2) => setTimeout(r2, 10))
    }
    const done = await state(call)
    expect(done.results.map((r) => r.code)).toEqual(['unauthorized', 'unauthorized'])
    for (const text of bodies) {
      expect(text).not.toContain(TOKEN)
      expect(text).not.toContain('RAW-GITHUB-TEXT')
    }
  })

  it('#65 AC10: an unexpected throw releases the lock', async () => {
    await link('acme/one')
    let first = true
    const f = vi.fn(async () => {
      if (first) {
        first = false
        throw new Error('x')
      }
      return new Response(JSON.stringify(okPage))
    }) as unknown as typeof fetch
    const call = await boot({ token: TOKEN, fetchImpl: f })
    await start(call)
    await settle(call)
    expect((await start(call)).status).toBe(202)
    await settle(call)
  })

  it('#65 AC10: the server stays bound to 127.0.0.1', async () => {
    await boot({ token: TOKEN })
    const addr = server!.address()
    expect(addr && typeof addr !== 'string' && addr.address).toBe('127.0.0.1')
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

describe('/api/team', () => {
  const day = 24 * 60 * 60 * 1000
  const iso = (days: number) => new Date(NOW.getTime() - days * day).toISOString()
  const base = stored.pullRequests[0]
  const teamRepo: StoredRepo = {
    ...stored,
    pullRequests: [
      { ...base, number: 1, author: 'ana', createdAt: iso(2), mergedAt: null, closedAt: null },
      { ...base, number: 2, author: 'old-timer', createdAt: iso(200), mergedAt: null, closedAt: null },
      { ...base, number: 3, author: 'dependabot[bot]', authorIsBot: true, createdAt: iso(1), mergedAt: null, closedAt: null },
    ],
    reviews: [
      { id: 'r1', pullRequestNumber: 1, reviewer: 'bob', reviewerIsBot: false, outcome: 'approved', submittedAt: iso(3) },
      { id: 'r2', pullRequestNumber: 1, reviewer: 'ci[bot]', reviewerIsBot: true, outcome: 'commented', submittedAt: iso(3) },
    ],
  }
  const put = (call: Awaited<ReturnType<typeof boot>>, body: unknown) =>
    call('/api/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const noNet = () =>
    vi.fn(async () => {
      throw new Error('network disabled')
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>

  it('#15 AC1: GET lists non-bot candidates from the last 90 days with counts and repos, no network', async () => {
    await link('acme/widgets', 'acme/unsynced')
    await writeRepo(teamRepo, dir)
    const f = noNet()
    const call = await boot({ fetchImpl: f })
    const res = await call('/api/team')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      candidates: [
        { login: 'ana', pullRequests: 1, reviews: 0, repos: ['acme/widgets'] },
        { login: 'bob', pullRequests: 0, reviews: 1, repos: ['acme/widgets'] },
      ],
      selected: null,
      added: [],
      anySynced: true,
    })
    expect(f).not.toHaveBeenCalled()
  })

  it('#15 AC2: first run has selected null and no candidates without repos', async () => {
    const call = await boot()
    expect(await (await call('/api/team')).json()).toEqual({
      candidates: [],
      selected: null,
      added: [],
      anySynced: false,
    })
  })

  it('#15 AC6: anySynced is false when linked repos are not synced', async () => {
    await link('acme/unsynced')
    const call = await boot()
    expect(await (await call('/api/team')).json()).toMatchObject({ candidates: [], anySynced: false })
  })

  it('#15 AC5: a synced repo with no activity has no candidates but anySynced is true', async () => {
    await link('acme/widgets')
    await writeRepo({ ...teamRepo, pullRequests: [], reviews: [] }, dir)
    const call = await boot()
    expect(await (await call('/api/team')).json()).toEqual({
      candidates: [],
      selected: null,
      added: [],
      anySynced: true,
    })
  })

  it('#15 AC4: a PUT persists and GET returns it (deduped case-insensitively)', async () => {
    const call = await boot()
    const res = await put(call, { selected: ['ana', 'Ana', 'bob'], added: ['zed'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await (await call('/api/team')).json()).toEqual({
      candidates: [],
      selected: ['ana', 'bob'],
      added: ['zed'],
      anySynced: false,
    })
  })

  it('#15 AC4: an empty selection is allowed', async () => {
    const call = await boot()
    expect((await put(call, { selected: [], added: [] })).status).toBe(200)
    expect(((await (await call('/api/team')).json()) as { selected: unknown }).selected).toEqual([])
  })

  it('#15 AC3: invalid or [bot] logins, wrong shapes and null selected return 400 and store nothing', async () => {
    const call = await boot()
    for (const body of [
      { selected: ['dependabot[bot]'], added: [] },
      { selected: [], added: ['a b'] },
      { selected: [''], added: [] },
      { selected: null, added: [] },
      { selected: ['ana'] },
      { selected: 'ana', added: [] },
      { selected: [5], added: [] },
      { selected: Array.from({ length: 1001 }, (_, i) => `u${i}`), added: [] },
      '{nope',
      'null',
    ]) {
      const res = await put(call, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_team' })
    }
    await expect(readFile(path.join(dir, 'team.json'), 'utf8')).rejects.toThrow()
  })

  it('#15 AC3: a body over 64 KB returns 413', async () => {
    const call = await boot()
    const res = await put(call, { selected: [], added: [], pad: 'x'.repeat(70 * 1024) })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too_large' })
  })

  it('#15 AC8: the stored file contains only selected and added', async () => {
    const call = await boot()
    await put(call, { selected: ['ana'], added: ['bob'], email: 'a@example.com', name: 'Ana' })
    expect(JSON.parse(await readFile(path.join(dir, 'team.json'), 'utf8'))).toEqual({
      selected: ['ana'],
      added: ['bob'],
    })
  })

  it('#15 AC8: an invalid team file returns 500 team_invalid; an invalid config returns 500 config_invalid', async () => {
    const call = await boot()
    await writeFile(path.join(dir, 'team.json'), '{"selected":["x[bot]"],"added":[]}')
    const res = await call('/api/team')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'team_invalid' })
    await writeFile(path.join(dir, 'config.json'), '{nope')
    const res2 = await call('/api/team')
    expect(res2.status).toBe(500)
    expect(await res2.json()).toEqual({ error: 'config_invalid' })
  })

  it('#15 AC4: concurrent PUTs are serialized and leave a valid file', async () => {
    const call = await boot()
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => put(call, { selected: [`user${i}`], added: [] })),
    )
    expect(results.every((r) => r.status === 200)).toBe(true)
    const team = JSON.parse(await readFile(path.join(dir, 'team.json'), 'utf8')) as { selected: string[] }
    expect(team.selected).toHaveLength(1)
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
