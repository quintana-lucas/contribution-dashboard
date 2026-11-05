import { describe, expect, it, vi } from 'vitest'
import { getRepoData, syncRepo } from './client.ts'
import type { StoredRepo } from './types.ts'

const stored: StoredRepo = { schemaVersion: 1, repo: 'acme/widgets', pullRequests: [], reviews: [] }

const spy = (res: () => Response) => vi.fn(async () => res()) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('api client', () => {
  it('#7 AC7: getRepoData and syncRepo only call relative /api/ URLs, never api.github.com', async () => {
    const f = spy(() => new Response(JSON.stringify(stored), { status: 200 }))
    await getRepoData('acme/widgets', f)
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
    const ok = await getRepoData('acme/widgets', spy(() => new Response(JSON.stringify(stored), { status: 200 })))
    expect(ok).toEqual({ ok: true, data: stored })
    const missing = await getRepoData('acme/widgets', spy(() => new Response('{"error":"not_synced"}', { status: 404 })))
    expect(missing).toEqual({ ok: false, error: 'not_synced' })
    const bad = await getRepoData('x', spy(() => new Response('{"error":"invalid_repo"}', { status: 400 })))
    expect(bad).toEqual({ ok: false, error: 'invalid_repo' })
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
