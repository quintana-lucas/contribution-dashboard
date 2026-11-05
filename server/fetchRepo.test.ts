// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fetchRepoActivity } from './fetchRepo.ts'

const TOKEN = 'fake-token-for-tests-7'
const NOW = new Date('2026-06-01T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

const pi = (hasNextPage = false, endCursor: string | null = null) => ({ hasNextPage, endCursor })
const review = (id: string, state = 'APPROVED', login: string | null = 'rev-user', submittedAt: string | null = daysAgo(1)) => ({
  id,
  state,
  submittedAt,
  author: login ? { login } : null,
})
const pr = (number: number, over: Record<string, unknown> = {}) => ({
  number,
  state: 'OPEN',
  createdAt: daysAgo(10),
  updatedAt: daysAgo(2),
  mergedAt: null,
  closedAt: null,
  author: { login: 'fake-author' },
  reviews: { pageInfo: pi(), nodes: [] as unknown[] },
  ...over,
})
const prPage = (nodes: unknown[], next: string | null = null) => ({
  data: { repository: { pullRequests: { pageInfo: pi(next !== null, next), nodes } } },
})

function fakeFetch(responses: unknown[]) {
  const bodies: { query: string; variables: Record<string, unknown> }[] = []
  let i = 0
  const impl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string))
    const r = responses[i++]
    if (r instanceof Response) return r
    return new Response(JSON.stringify(r), { status: 200 })
  }) as unknown as typeof fetch
  return { impl, bodies }
}

const run = (responses: unknown[]) => {
  const f = fakeFetch(responses)
  return fetchRepoActivity({ token: TOKEN, owner: 'acme', name: 'widgets', now: NOW, fetchImpl: f.impl }).then(
    (result) => ({ result, ...f }),
  )
}

describe('fetchRepoActivity', () => {
  it('AC3: follows PR pages while hasNextPage and stores both pages', async () => {
    const { result, bodies } = await run([prPage([pr(2)], 'c1'), prPage([pr(1)])])
    expect(result.ok && result.repo.pullRequests.map((p) => p.number)).toEqual([1, 2])
    expect(bodies[1].variables.cursor).toBe('c1')
  })

  it('AC3: pages through a PR with more than one page of reviews', async () => {
    const first = pr(1, { reviews: { pageInfo: pi(true, 'r1'), nodes: [review('R1')] } })
    const second = { data: { repository: { pullRequest: { reviews: { pageInfo: pi(), nodes: [review('R2')] } } } } }
    const { result, bodies } = await run([prPage([first]), second])
    expect(result.ok && result.repo.reviews.map((r) => r.id)).toEqual(['R1', 'R2'])
    expect(bodies[1].variables).toMatchObject({ number: 1, cursor: 'r1' })
  })

  it('AC9: stops paging past 90 days and keeps PRs at day 89', async () => {
    const { result, bodies } = await run([
      prPage([pr(3, { updatedAt: daysAgo(89) }), pr(2, { updatedAt: daysAgo(91) })], 'c1'),
      prPage([pr(1)]),
    ])
    expect(bodies).toHaveLength(1)
    expect(result.ok && result.repo.pullRequests.map((p) => p.number)).toEqual([3])
  })

  it('AC1: maps state, author, reviewer, state and dates; drops pending, null-date and extra fields', async () => {
    const nodes = [
      pr(1, { state: 'MERGED', mergedAt: daysAgo(3), closedAt: daysAgo(3), body: 'secret', email: 'a@b.c' }),
      pr(2, { state: 'CLOSED', closedAt: daysAgo(4), author: null }),
      pr(3, {
        reviews: {
          pageInfo: pi(),
          nodes: [
            review('A', 'CHANGES_REQUESTED', 'rev-one', '2026-05-30T10:00:00Z'),
            review('B', 'PENDING'),
            review('C', 'COMMENTED', 'rev-two', null),
            review('D', 'APPROVED', null),
          ],
        },
      }),
    ]
    const { result } = await run([prPage(nodes)])
    if (!result.ok) throw new Error('expected ok')
    const [p1, p2, p3] = result.repo.pullRequests
    expect(p1).toEqual({
      number: 1,
      author: 'fake-author',
      state: 'merged',
      createdAt: daysAgo(10),
      updatedAt: daysAgo(2),
      mergedAt: daysAgo(3),
      closedAt: daysAgo(3),
    })
    expect(p2).toMatchObject({ state: 'closed', author: null })
    expect(p3.state).toBe('open')
    expect(result.repo.reviews).toEqual([
      { id: 'A', pullRequestNumber: 3, reviewer: 'rev-one', state: 'CHANGES_REQUESTED', submittedAt: '2026-05-30T10:00:00Z' },
      { id: 'D', pullRequestNumber: 3, reviewer: null, state: 'APPROVED', submittedAt: daysAgo(1) },
    ])
    expect(result.repo).toMatchObject({ schemaVersion: 1, repo: 'acme/widgets' })
    expect(JSON.stringify(result.repo)).not.toMatch(/secret|a@b\.c/)
  })

  it('AC4: a node duplicated across pages appears once, output sorted', async () => {
    const r = review('X')
    const { result } = await run([
      prPage([pr(5, { reviews: { pageInfo: pi(), nodes: [r] } }), pr(2)], 'c1'),
      prPage([pr(5, { reviews: { pageInfo: pi(), nodes: [r] } }), pr(1)]),
    ])
    if (!result.ok) throw new Error('expected ok')
    expect(result.repo.pullRequests.map((p) => p.number)).toEqual([1, 2, 5])
    expect(result.repo.reviews).toHaveLength(1)
  })

  it('AC5: an error on page 2 returns the code and no repo', async () => {
    const { result } = await run([prPage([pr(1)], 'c1'), new Response('', { status: 401 })])
    expect(result).toEqual({ ok: false, code: 'unauthorized' })
  })

  it('AC3: hasNextPage without endCursor on a PR page returns bad_response (no refetch)', async () => {
    const page = { data: { repository: { pullRequests: { pageInfo: pi(true, null), nodes: [pr(1)] } } } }
    const { result, bodies } = await run([page, prPage([pr(2)])])
    expect(result).toEqual({ ok: false, code: 'bad_response' })
    expect(bodies).toHaveLength(1)
  })

  it('AC3: hasNextPage without endCursor on a review page returns bad_response (no refetch)', async () => {
    const first = pr(1, { reviews: { pageInfo: pi(true, null), nodes: [review('R1')] } })
    const { result, bodies } = await run([prPage([first])])
    expect(result).toEqual({ ok: false, code: 'bad_response' })
    expect(bodies).toHaveLength(1)
  })

  it('AC5: a missing repository maps to not_found', async () => {
    const { result } = await run([{ data: { repository: null } }])
    expect(result).toEqual({ ok: false, code: 'not_found' })
  })
})
