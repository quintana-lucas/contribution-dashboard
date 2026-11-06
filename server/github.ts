import type { SyncErrorCode } from './messages.ts'

export type TokenValidity = 'valid' | 'invalid' | 'unreachable'

export type GraphqlResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: SyncErrorCode }

export async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphqlResult<T>> {
  let res: Response
  try {
    res = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'contribution-dashboard',
      },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    // Swallow the error: its message could contain the token.
    return { ok: false, code: 'network' }
  }

  if (res.status === 401) return { ok: false, code: 'unauthorized' }
  if (res.status === 403 || res.status === 429) {
    const limited =
      res.status === 429 ||
      res.headers.get('x-ratelimit-remaining') === '0' ||
      res.headers.get('retry-after') !== null
    return { ok: false, code: limited ? 'rate_limited' : 'forbidden' }
  }

  let body: { data?: unknown; errors?: { type?: string }[] } | null
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { ok: false, code: 'bad_response' }
  }
  if (body === null || typeof body !== 'object') return { ok: false, code: 'bad_response' }

  const errors = Array.isArray(body.errors) ? body.errors : []
  if (errors.some((e) => e?.type === 'RATE_LIMITED')) return { ok: false, code: 'rate_limited' }
  if (errors.some((e) => e?.type === 'NOT_FOUND')) return { ok: false, code: 'not_found' }
  if (errors.length > 0 || !res.ok || body.data === undefined || body.data === null) {
    return { ok: false, code: 'bad_response' }
  }
  return { ok: true, data: body.data as T }
}

export async function validateToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenValidity> {
  try {
    const res = await fetchImpl('https://api.github.com/rate_limit', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'contribution-dashboard',
      },
    })
    if (res.status >= 200 && res.status < 300) return 'valid'
    if (res.status === 401) return 'invalid'
    return 'unreachable'
  } catch {
    // Swallow the error: its message could contain the token.
    return 'unreachable'
  }
}
