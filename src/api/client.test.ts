import { describe, expect, it, vi } from 'vitest'
import { getRepoData, listRepos, syncRepo } from './client.ts'
import type { StoredRepo } from './types.ts'

const stored: StoredRepo = { schemaVersion: 2, repo: 'acme/widgets', syncedAt: '2026-06-01T00:00:00.000Z', pullRequests: [], reviews: [] }

const spy = (res: () => Response) => vi.fn(async () => res()) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('listRepos', () => {
  it('#16 AC1: parses the repos from /api/repos', async () => {
    const repos = [
      { repo: 'acme/widgets', syncedAt: '2026-06-01T00:00:00.000Z' },
      { repo: 'acme/new', syncedAt: null },
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
    const ok = spy(() => new Response('{"ok":true}', { status: 200 }))
    expect(await syncRepo('acme/widgets', ok)).toEqual({ ok: true })
  })
})
