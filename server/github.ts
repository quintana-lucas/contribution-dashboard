export type TokenValidity = 'valid' | 'invalid' | 'unreachable'

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
