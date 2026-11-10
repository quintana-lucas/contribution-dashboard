import { describe, expect, it, vi } from 'vitest'
import { addRepo, getRepoData, getTeam, getTokenStatus, listRepos, removeRepo, saveTeam, syncRepo } from './client.ts'
import type { StoredRepo } from './types.ts'

const stored: StoredRepo = { schemaVersion: 2, repo: 'acme/widgets', syncedAt: '2026-06-01T00:00:00.000Z', pullRequests: [], reviews: [] }

const spy = (res: () => Response) => vi.fn(async () => res()) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('listRepos', () => {
  it('#16 AC1: parses the repos from /api/repos', async () => {
    const repos = [
      { repo: 'acme/widgets', syncedAt: '2026-06-01T00:00:00.000Z', baseBranch: 'main', people: 2 },
      { repo: 'acme/new', syncedAt: null, baseBranch: null, people: null },
    ]
    const f = spy(() => new Response(JSON.stringify({ repos }), { status: 200 }))
    expect(await listRepos(f)).toEqual({ ok: true, repos })
    expect(String(f.mock.calls[0][0])).toBe('/api/repos')
  })

  it('#16 AC1: a network or HTTP error returns request_failed', async () => {
    const down = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await listRepos(down)).toEqual({ ok: false, error: 'request_failed' })
    const http = spy(() => new Response('{"error":"config_invalid"}', { status: 500 }))
    expect(await listRepos(http)).toEqual({ ok: false, error: 'request_failed' })
  })
})

describe('team client', () => {
  it('#15 AC1: getTeam parses candidates, selected and added from /api/team', async () => {
    const body = {
      candidates: [{ login: 'ana', pullRequests: 1, reviews: 2, repos: ['acme/api'] }],
      selected: null,
      added: ['zoe'],
    }
    const f = spy(() => new Response(JSON.stringify(body), { status: 200 }))
    expect(await getTeam(f)).toEqual({ ok: true, ...body })
    expect(String(f.mock.calls[0][0])).toBe('/api/team')
  })

  it('#15 AC1: getTeam fails on network, HTTP or bad shape', async () => {
    const down = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await getTeam(down)).toEqual({ ok: false })
    expect(await getTeam(spy(() => new Response('{"error":"team_invalid"}', { status: 500 })))).toEqual({ ok: false })
    expect(await getTeam(spy(() => new Response('{"candidates":[]}', { status: 200 })))).toEqual({ ok: false })
  })

  it('#15 AC8: saveTeam PUTs only the two login lists', async () => {
    const f = spy(() => new Response('{"ok":true}', { status: 200 }))
    expect(await saveTeam({ selected: ['ana'], added: [], extra: 'x' } as never, f)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/team')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ selected: ['ana'], added: [] })
    expect(await saveTeam({ selected: [], added: [] }, spy(() => new Response('{}', { status: 400 })))).toEqual({ ok: false })
    const down = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await saveTeam({ selected: [], added: [] }, down)).toEqual({ ok: false })
  })
})

describe('api client', () => {
  it('#7 AC7: getRepoData and syncRepo only call relative /api/ URLs, never api.github.com', async () => {
    const f = spy(() => new Response(JSON.stringify(stored), { status: 200 }))
    await getRepoData('acme/widgets', {}, f)
    await syncRepo('acme/widgets', f)
    const urls = f.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(urls).toHaveLength(2)
    for (const url of urls) {
      expect(url.startsWith('/api/')).toBe(true)
      expect(url).not.toContain('api.github.com')
    }
    expect(urls[0]).toBe('/api/data?repo=acme%2Fwidgets')
    expect(urls[1]).toBe('/api/repos/acme/widgets/sync')
  })

  it('#7 AC7: getRepoData returns typed data, and maps 404/400 to errors', async () => {
    const ok = await getRepoData('acme/widgets', {}, spy(() => new Response(JSON.stringify(stored), { status: 200 })))
    expect(ok).toEqual({ ok: true, data: stored })
    const missing = await getRepoData('acme/widgets', {}, spy(() => new Response('{"error":"not_synced"}', { status: 404 })))
    expect(missing).toEqual({ ok: false, error: 'not_synced' })
    const bad = await getRepoData('x', {}, spy(() => new Response('{"error":"invalid_repo"}', { status: 400 })))
    expect(bad).toEqual({ ok: false, error: 'invalid_repo' })
  })

  const withBot: StoredRepo = {
    ...stored,
    pullRequests: [
      { number: 1, author: 'dependabot[bot]', authorIsBot: true, state: 'open', createdAt: 'a', updatedAt: 'a', mergedAt: null, closedAt: null, additions: 1, deletions: 1, baseBranch: 'main', requestedReviewers: [] },
      { number: 2, author: 'alice', authorIsBot: false, state: 'open', createdAt: 'a', updatedAt: 'a', mergedAt: null, closedAt: null, additions: 1, deletions: 1, baseBranch: 'main', requestedReviewers: [] },
    ],
    reviews: [
      { id: 'r1', pullRequestNumber: 2, reviewer: 'ci[bot]', reviewerIsBot: true, outcome: 'commented', submittedAt: 'a' },
    ],
  }

  it('#13 AC4: getRepoData excludes bots by default and keeps them with includeBots', async () => {
    const f = () => spy(() => new Response(JSON.stringify(withBot), { status: 200 }))
    const def = await getRepoData('acme/widgets', {}, f())
    expect(def.ok && def.data.pullRequests.map((p) => p.number)).toEqual([2])
    expect(def.ok && def.data.reviews).toEqual([])
    const all = await getRepoData('acme/widgets', { includeBots: true }, f())
    expect(all).toEqual({ ok: true, data: withBot })
  })

  it('#13 AC3: getRepoData exposes syncedAt', async () => {
    const res = await getRepoData('acme/widgets', {}, spy(() => new Response(JSON.stringify(stored), { status: 200 })))
    expect(res.ok && res.data.syncedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('#7 AC5: syncRepo surfaces the server code and message', async () => {
    const f = spy(
      () => new Response(JSON.stringify({ ok: false, code: 'rate_limited', message: 'slow down' }), { status: 502 }),
    )
    expect(await syncRepo('acme/widgets', f)).toEqual({ ok: false, code: 'rate_limited', message: 'slow down' })
    const ok = spy(() => new Response('{"ok":true,"people":4}', { status: 200 }))
    expect(await syncRepo('acme/widgets', ok)).toEqual({ ok: true, people: 4 }) // #8 AC5
  })
})

const reply = (body: unknown, status = 200) => spy(() => new Response(JSON.stringify(body), { status }))

describe('addRepo', () => {
  it('#8 AC12: maps every response shape', async () => {
    expect(await addRepo('acme/widgets', reply({ repo: 'acme/widgets', synced: true, people: 3 }, 201))).toEqual({
      ok: true, repo: 'acme/widgets', synced: true, people: 3,
    })
    expect(await addRepo('acme/widgets', reply({ repo: 'acme/widgets', synced: false, code: 'network' }, 201))).toEqual({
      ok: true, repo: 'acme/widgets', synced: false,
    })
    expect(await addRepo('x', reply({ error: 'invalid_format' }, 400))).toEqual({ ok: false, error: 'invalid_format' })
    expect(await addRepo('a/b', reply({ error: 'duplicate', repo: 'A/B' }, 409))).toEqual({
      ok: false, error: 'duplicate', repo: 'A/B',
    })
    expect(await addRepo('a/b', reply({ error: 'not_found_or_no_access' }, 404))).toEqual({
      ok: false, error: 'not_found_or_no_access',
    })
    expect(await addRepo('a/b', reply({ error: 'missing_token' }, 503))).toEqual({ ok: false, error: 'missing_token' })
    expect(await addRepo('a/b', reply({ error: 'github_failed' }, 502))).toEqual({ ok: false, error: 'request_failed' })
    const down = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await addRepo('a/b', down)).toEqual({ ok: false, error: 'request_failed' })
  })

  it('#8 AC12: posts the input as JSON', async () => {
    const f = reply({ repo: 'acme/widgets', synced: true, people: 0 }, 201)
    await addRepo('github.com/acme/widgets', f)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/repos')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ input: 'github.com/acme/widgets' })
  })
})

describe('removeRepo and getTokenStatus', () => {
  it('#8 AC4: removeRepo maps success and failure', async () => {
    const f = reply({ ok: true })
    expect(await removeRepo('acme/widgets', f)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/repos/acme/widgets')
    expect(init.method).toBe('DELETE')
    expect(await removeRepo('acme/widgets', reply({ error: 'not_linked' }, 404))).toEqual({ ok: false })
    expect(await removeRepo('bad', f)).toEqual({ ok: false })
  })

  it('#8 AC9: getTokenStatus maps configured true or false, and a failure', async () => {
    expect(await getTokenStatus(reply({ configured: true }))).toEqual({ ok: true, configured: true })
    expect(await getTokenStatus(reply({ configured: false }))).toEqual({ ok: true, configured: false })
    expect(await getTokenStatus(reply({}, 500))).toEqual({ ok: false })
    expect(await getTokenStatus(reply({ nope: 1 }))).toEqual({ ok: false })
    const down = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await getTokenStatus(down)).toEqual({ ok: false })
  })

  it('#8 AC13: every client function calls only relative /api/ URLs', async () => {
    const f = reply({ ok: true, configured: true, repo: 'a/b', synced: true, people: 1, repos: [] })
    await listRepos(f)
    await addRepo('a/b', f)
    await removeRepo('a/b', f)
    await syncRepo('a/b', f)
    await getTokenStatus(f)
    const urls = f.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(urls).toHaveLength(5)
    for (const url of urls) {
      expect(url.startsWith('/api/')).toBe(true)
      expect(url).not.toContain('api.github.com')
    }
  })
})
