import { excludeBots } from './excludeBots.ts'
import type { LinkedRepo, StoredRepo } from './types.ts'

export type ListReposResult =
  | { ok: true; repos: LinkedRepo[] }
  | { ok: false; error: 'request_failed' }

// Relative `/api/...` URLs only: the UI never talks to GitHub directly.

export type RepoDataResult =
  | { ok: true; data: StoredRepo }
  | { ok: false; error: 'invalid_repo' | 'not_synced' | 'request_failed' }

export type SyncResult =
  | { ok: true }
  | { ok: false; code: string; message: string }

type FetchLike = typeof fetch

/** Reads the locally stored data of a repo through the server. Bots are excluded unless `includeBots` is true. */
export async function getRepoData(
  repo: string,
  { includeBots = false }: { includeBots?: boolean } = {},
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<RepoDataResult> {
  try {
    const res = await fetchImpl(`/api/data?repo=${encodeURIComponent(repo)}`)
    if (res.ok) {
      const data = (await res.json()) as StoredRepo
      return { ok: true, data: includeBots ? data : excludeBots(data) }
    }
    if (res.status === 400) return { ok: false, error: 'invalid_repo' }
    if (res.status === 404) return { ok: false, error: 'not_synced' }
  } catch {
    // fall through
  }
  return { ok: false, error: 'request_failed' }
}

/** Lists the linked repos and when each last synced (local store only). */
export async function listRepos(
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<ListReposResult> {
  try {
    const res = await fetchImpl('/api/repos')
    if (res.ok) {
      const body = (await res.json()) as { repos?: LinkedRepo[] }
      if (Array.isArray(body.repos)) return { ok: true, repos: body.repos }
    }
  } catch {
    // fall through
  }
  return { ok: false, error: 'request_failed' }
}

/** Asks the server to sync one linked repo from GitHub. */
export async function syncRepo(
  repo: string,
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<SyncResult> {
  const fallback = { ok: false, code: 'request_failed', message: 'Could not reach the local server.' } as const
  const [owner, name] = repo.split('/')
  if (!owner || !name) return fallback
  try {
    const res = await fetchImpl(
      `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/sync`,
      { method: 'POST' },
    )
    const body = (await res.json()) as {
      ok?: boolean
      code?: string
      message?: string
      error?: string
    }
    if (res.ok && body.ok) return { ok: true }
    return {
      ok: false,
      code: body.code ?? body.error ?? 'request_failed',
      message: body.message ?? fallback.message,
    }
  } catch {
    return fallback
  }
}
