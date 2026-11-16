// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fetchRepoActivity, isBotAccount, mapOutcome } from './fetchRepo.ts'

const TOKEN = 'fake-token-for-tests-7'
const NOW = new Date('2026-06-01T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

const pi = (hasNextPage = false, endCursor: string | null = null) => ({ hasNextPage, endCursor })
const review = (id: string, state = 'APPROVED', login: string | null = 'rev-user', submittedAt: string | null = daysAgo(1)) => ({
  id,
  state,
  submittedAt,
  author: login ? { login, __typename: 'User' } : null,
})
const pr = (number: number, over: Record<string, unknown> = {}) => ({
  number,
  title: `Fake PR ${number}`,
  state: 'OPEN',
  createdAt: daysAgo(10),
  updatedAt: daysAgo(2),
  mergedAt: null,
  closedAt: null,
  additions: 10,
  deletions: 4,
  baseRefName: 'main',
  author: { login: 'fake-author', __typename: 'User' },
  reviewRequests: { nodes: [] as unknown[] },
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

// Responses are for the OPEN pass; an empty page is appended for the CLOSED/MERGED pass.
// Use runPasses to script the closed pass explicitly.
const run = (responses: unknown[]) => runPasses(responses, [prPage([])])
const runPasses = (open: unknown[], closed: unknown[]) => {
  const f = fakeFetch([...open, ...closed])
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

  it('#33 AC2/AC3: closed and merged PRs are kept at day 89, dropped at day 91, and paging stops', async () => {
    const closed = (n: number, d: number, state = 'CLOSED') =>
      pr(n, { state, updatedAt: daysAgo(d), closedAt: daysAgo(d) })
    const { result, bodies } = await runPasses(
      [prPage([])],
      [prPage([closed(3, 89), closed(4, 90.5, 'MERGED'), closed(2, 91)], 'c1'), prPage([closed(1, 100)])],
    )
    expect(bodies).toHaveLength(2)
    expect(bodies[1].variables.states).toEqual(['CLOSED', 'MERGED'])
    expect(result.ok && result.repo.pullRequests.map((p) => p.number)).toEqual([3])
  })

  it('#33 AC1: an open PR idle for more than 90 days is kept, and open PRs are queried by state', async () => {
    const { result, bodies } = await run([
      prPage([pr(2, { updatedAt: daysAgo(5) }), pr(1, { updatedAt: daysAgo(400) })], 'c1'),
      prPage([pr(0, { updatedAt: daysAgo(900) })]),
    ])
    expect(bodies[0].variables.states).toEqual(['OPEN'])
    expect(bodies[1].variables.cursor).toBe('c1')
    expect(result.ok && result.repo.pullRequests.map((p) => p.number)).toEqual([0, 1, 2])
  })

  it('#33 AC4: a PR returned on several pages and in both passes appears once', async () => {
    const { result } = await runPasses(
      [prPage([pr(1), pr(2)], 'c1'), prPage([pr(2), pr(3)])],
      [prPage([pr(3, { state: 'MERGED', mergedAt: daysAgo(2) })])],
    )
    if (!result.ok) throw new Error('expected ok')
    expect(result.repo.pullRequests.map((p) => p.number)).toEqual([1, 2, 3])
  })

  it('#33 AC5: a PR stored as open that has since closed follows the 90-day rule', async () => {
    // The sync rebuilds from GitHub, so the old open copy never carries over: it now only
    // appears in the closed pass, where it is kept when recent and dropped when old.
    const recent = pr(1, { state: 'CLOSED', updatedAt: daysAgo(10), closedAt: daysAgo(10) })
    const old = pr(2, { state: 'CLOSED', updatedAt: daysAgo(200), closedAt: daysAgo(200) })
    const { result } = await runPasses([prPage([])], [prPage([recent, old])])
    if (!result.ok) throw new Error('expected ok')
    expect(result.repo.pullRequests.map((p) => [p.number, p.state])).toEqual([[1, 'closed']])
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
      title: 'Fake PR 1',
      author: 'fake-author',
      state: 'merged',
      createdAt: daysAgo(10),
      updatedAt: daysAgo(2),
      mergedAt: daysAgo(3),
      closedAt: daysAgo(3),
      authorIsBot: false,
      additions: 10,
      deletions: 4,
      baseBranch: 'main',
      requestedReviewers: [],
    })
    expect(p2).toMatchObject({ state: 'closed', author: null })
    expect(p3.state).toBe('open')
    expect(result.repo.reviews).toEqual([
      { id: 'A', pullRequestNumber: 3, reviewer: 'rev-one', reviewerIsBot: false, outcome: 'changes_requested', submittedAt: '2026-05-30T10:00:00Z' },
      { id: 'D', pullRequestNumber: 3, reviewer: null, reviewerIsBot: false, outcome: 'approved', submittedAt: daysAgo(1) },
    ])
    expect(result.repo).toMatchObject({ schemaVersion: 3, repo: 'acme/widgets' })
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

  it('#13 AC1: stores additions, deletions, base branch, requested users and teams, and the three states', async () => {
    const nodes = [
      pr(1, { state: 'OPEN', additions: 120, deletions: 0, baseRefName: 'develop' }),
      pr(2, { state: 'MERGED', mergedAt: daysAgo(3), closedAt: daysAgo(3) }),
      pr(3, {
        state: 'CLOSED',
        closedAt: daysAgo(3),
        reviewRequests: {
          nodes: [
            { requestedReviewer: { __typename: 'Team', slug: 'core' } },
            { requestedReviewer: { __typename: 'User', login: 'zed' } },
            { requestedReviewer: { __typename: 'Mannequin', login: 'imported' } },
            { requestedReviewer: { __typename: 'User', login: 'amy' } },
            { requestedReviewer: null },
          ],
        },
      }),
    ]
    const { result, bodies } = await run([prPage(nodes)])
    if (!result.ok) throw new Error('expected ok')
    const [p1, p2, p3] = result.repo.pullRequests
    expect(p1).toMatchObject({ state: 'open', additions: 120, deletions: 0, baseBranch: 'develop' })
    expect(p2.state).toBe('merged')
    expect(p3.state).toBe('closed')
    expect(p3.requestedReviewers).toEqual([
      { kind: 'team', slug: 'core' },
      { kind: 'user', login: 'amy', isBot: false },
      { kind: 'user', login: 'imported', isBot: false },
      { kind: 'user', login: 'zed', isBot: false },
    ])
    expect(bodies[0].query).not.toMatch(/email/i)
  })

  it('#13 AC1: non-numeric additions or a missing base branch returns bad_response', async () => {
    expect((await run([prPage([pr(1, { additions: 'x' })])])).result).toEqual({ ok: false, code: 'bad_response' })
    expect((await run([prPage([pr(1, { deletions: null })])])).result).toEqual({ ok: false, code: 'bad_response' })
    expect((await run([prPage([pr(1, { baseRefName: undefined })])])).result).toEqual({ ok: false, code: 'bad_response' })
  })

  it('#13 AC2: maps each outcome, keeps dismissed, drops PENDING', async () => {
    const reviews = {
      pageInfo: pi(),
      nodes: [
        review('A', 'APPROVED'),
        review('B', 'CHANGES_REQUESTED'),
        review('C', 'COMMENTED'),
        review('D', 'DISMISSED'),
        review('E', 'PENDING'),
      ],
    }
    const { result } = await run([prPage([pr(1, { reviews })])])
    if (!result.ok) throw new Error('expected ok')
    expect(result.repo.reviews.map((r) => [r.id, r.outcome])).toEqual([
      ['A', 'approved'],
      ['B', 'changes_requested'],
      ['C', 'commented'],
      ['D', 'dismissed'],
    ])
  })

  it('#13 AC2: an unknown review state returns bad_response', async () => {
    const reviews = { pageInfo: pi(), nodes: [review('A', 'WEIRD')] }
    const { result } = await run([prPage([pr(1, { reviews })])])
    expect(result).toEqual({ ok: false, code: 'bad_response' })
  })

  it('#13 AC4: flags Bot-typename and [bot] accounts as bots, and a User is not', async () => {
    const botReview = { id: 'B1', state: 'COMMENTED', submittedAt: daysAgo(1), author: { login: 'github-actions', __typename: 'Bot' } }
    const suffixReview = { id: 'B2', state: 'COMMENTED', submittedAt: daysAgo(1), author: { login: 'dependabot[bot]' } }
    const nodes = [
      pr(1, {
        author: { login: 'dependabot', __typename: 'Bot' },
        reviewRequests: {
          nodes: [
            { requestedReviewer: { __typename: 'Bot', login: 'copilot' } },
            { requestedReviewer: { __typename: 'User', login: 'human' } },
          ],
        },
        reviews: { pageInfo: pi(), nodes: [botReview, suffixReview, review('H1')] },
      }),
      pr(2, { author: { login: 'renovate[bot]' } }),
      pr(3),
    ]
    const { result } = await run([prPage(nodes)])
    if (!result.ok) throw new Error('expected ok')
    const [p1, p2, p3] = result.repo.pullRequests
    expect([p1.authorIsBot, p2.authorIsBot, p3.authorIsBot]).toEqual([true, true, false])
    expect(p1.requestedReviewers).toEqual([
      { kind: 'user', login: 'copilot', isBot: true },
      { kind: 'user', login: 'human', isBot: false },
    ])
    expect(result.repo.reviews.map((r) => [r.id, r.reviewerIsBot])).toEqual([
      ['B1', true],
      ['B2', true],
      ['H1', false],
    ])
  })
})

describe('helpers', () => {
  it('#13 AC4: isBotAccount', () => {
    expect(isBotAccount('x', 'Bot')).toBe(true)
    expect(isBotAccount('x[bot]', 'User')).toBe(true)
    expect(isBotAccount('x', 'User')).toBe(false)
    expect(isBotAccount(null, undefined)).toBe(false)
  })

  it('#13 AC2: mapOutcome', () => {
    expect(mapOutcome('PENDING')).toBeNull()
    expect(mapOutcome('DISMISSED')).toBe('dismissed')
  })
})
