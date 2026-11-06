import type {
  ReviewOutcome,
  StoredPullRequest,
  StoredRepo,
  StoredRequestedReviewer,
  StoredReview,
} from '../src/api/types.ts'
import { githubGraphql, type GraphqlResult } from './github.ts'
import type { SyncErrorCode } from './messages.ts'

const WINDOW_DAYS = 90

const REVIEW_FIELDS = `
  pageInfo { hasNextPage endCursor }
  nodes { id state submittedAt author { login __typename } }
`

const PRS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number state createdAt updatedAt mergedAt closedAt
        additions deletions baseRefName
        author { login __typename }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login }
              ... on Bot { login }
              ... on Mannequin { login }
              ... on Team { slug }
            }
          }
        }
        reviews(first: 100) { ${REVIEW_FIELDS} }
      }
    }
  }
}`

const REVIEWS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(first: 100, after: $cursor) { ${REVIEW_FIELDS} }
    }
  }
}`

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}
interface RawAccount {
  login: string
  __typename?: string
}
interface RawRequestedReviewer {
  __typename?: string
  login?: string
  slug?: string
}
interface RawReview {
  id: string
  state: string
  submittedAt: string | null
  author: RawAccount | null
}
interface RawReviews {
  pageInfo: PageInfo
  nodes: (RawReview | null)[]
}
interface RawPr {
  number: number
  state: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  additions: number
  deletions: number
  baseRefName: string
  author: RawAccount | null
  reviewRequests?: { nodes: unknown } | null
  reviews: RawReviews
}

export interface FetchRepoOptions {
  token: string
  owner: string
  name: string
  now: Date
  fetchImpl?: typeof fetch
}

export type FetchRepoResult =
  | { ok: true; repo: StoredRepo }
  | { ok: false; code: SyncErrorCode }

const bad = { ok: false, code: 'bad_response' } as const

function mapState(state: string): StoredPullRequest['state'] | null {
  if (state === 'MERGED') return 'merged'
  if (state === 'CLOSED') return 'closed'
  if (state === 'OPEN') return 'open'
  return null
}

/** A bot is a GraphQL `Bot` account, or (fallback) a login ending in `[bot]`. */
export function isBotAccount(login: string | null | undefined, typename: string | null | undefined): boolean {
  return typename === 'Bot' || (typeof login === 'string' && login.endsWith('[bot]'))
}

/** Maps a GitHub review state to the stored outcome. PENDING and unknown states return null. */
export function mapOutcome(state: string): ReviewOutcome | null {
  if (state === 'APPROVED') return 'approved'
  if (state === 'CHANGES_REQUESTED') return 'changes_requested'
  if (state === 'COMMENTED') return 'commented'
  if (state === 'DISMISSED') return 'dismissed'
  return null
}

function mapRequested(nodes: unknown): StoredRequestedReviewer[] | null {
  if (nodes === undefined || nodes === null) return []
  if (!Array.isArray(nodes)) return null
  const out: StoredRequestedReviewer[] = []
  for (const n of nodes as ({ requestedReviewer: RawRequestedReviewer | null } | null)[]) {
    const r = n?.requestedReviewer
    if (!r) continue
    if (r.__typename === 'Team') {
      if (typeof r.slug === 'string') out.push({ kind: 'team', slug: r.slug })
    } else if (typeof r.login === 'string') {
      out.push({ kind: 'user', login: r.login, isBot: isBotAccount(r.login, r.__typename) })
    }
  }
  const key = (q: StoredRequestedReviewer) => (q.kind === 'team' ? `team:${q.slug}` : `user:${q.login}`)
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

/** Returns false when a review has an unknown state. */
function mapReviews(prNumber: number, nodes: (RawReview | null)[], out: Map<string, StoredReview>): boolean {
  for (const r of nodes) {
    if (!r || typeof r.id !== 'string') continue
    if (r.state === 'PENDING' || !r.submittedAt) continue
    const outcome = mapOutcome(r.state)
    if (outcome === null) return false
    out.set(r.id, {
      id: r.id,
      pullRequestNumber: prNumber,
      reviewer: r.author?.login ?? null,
      reviewerIsBot: isBotAccount(r.author?.login, r.author?.__typename),
      outcome,
      submittedAt: r.submittedAt,
    })
  }
  return true
}

export async function fetchRepoActivity(opts: FetchRepoOptions): Promise<FetchRepoResult> {
  const { token, owner, name, now, fetchImpl = fetch } = opts
  const cutoff = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const prs = new Map<number, StoredPullRequest>()
  const reviews = new Map<string, StoredReview>()

  let cursor: string | null = null
  for (;;) {
    const res: GraphqlResult<{
      repository: { pullRequests: { pageInfo: PageInfo; nodes: (RawPr | null)[] } } | null
    }> = await githubGraphql(token, PRS_QUERY, { owner, name, cursor }, fetchImpl)
    if (!res.ok) return res
    const conn: { pageInfo: PageInfo; nodes: (RawPr | null)[] } | undefined =
      res.data.repository?.pullRequests
    if (!conn) return res.data.repository === null ? { ok: false, code: 'not_found' } : bad
    if (!Array.isArray(conn.nodes) || !conn.pageInfo) return bad

    let reachedOld = false
    for (const pr of conn.nodes) {
      if (!pr) continue
      const state = mapState(pr.state)
      if (state === null || typeof pr.number !== 'number') return bad
      if (new Date(pr.updatedAt).getTime() < cutoff) {
        reachedOld = true
        continue
      }
      if (!Number.isFinite(pr.additions) || !Number.isFinite(pr.deletions)) return bad
      if (typeof pr.baseRefName !== 'string' || pr.baseRefName === '') return bad
      const requestedReviewers = mapRequested(pr.reviewRequests?.nodes)
      if (requestedReviewers === null) return bad
      prs.set(pr.number, {
        number: pr.number,
        author: pr.author?.login ?? null,
        authorIsBot: isBotAccount(pr.author?.login, pr.author?.__typename),
        state,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        mergedAt: pr.mergedAt ?? null,
        closedAt: pr.closedAt ?? null,
        additions: pr.additions,
        deletions: pr.deletions,
        baseBranch: pr.baseRefName,
        requestedReviewers,
      })
      if (!pr.reviews || !Array.isArray(pr.reviews.nodes)) return bad
      if (!mapReviews(pr.number, pr.reviews.nodes, reviews)) return bad

      let more = pr.reviews.pageInfo
      while (more?.hasNextPage) {
        if (!more.endCursor) return bad
        const rr = await githubGraphql<{
          repository: { pullRequest: { reviews: RawReviews } | null } | null
        }>(token, REVIEWS_QUERY, { owner, name, number: pr.number, cursor: more.endCursor }, fetchImpl)
        if (!rr.ok) return rr
        const page = rr.data.repository?.pullRequest?.reviews
        if (!page || !Array.isArray(page.nodes) || !page.pageInfo) return bad
        if (!mapReviews(pr.number, page.nodes, reviews)) return bad
        more = page.pageInfo
      }
    }

    if (reachedOld || !conn.pageInfo.hasNextPage) break
    if (!conn.pageInfo.endCursor) return bad
    cursor = conn.pageInfo.endCursor
  }

  return {
    ok: true,
    repo: {
      schemaVersion: 2,
      repo: `${owner}/${name}`,
      pullRequests: [...prs.values()].sort((a, b) => a.number - b.number),
      reviews: [...reviews.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    },
  }
}
