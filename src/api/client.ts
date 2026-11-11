import { excludeBots } from './excludeBots.ts'
import type { Candidate } from './team.ts'
import type { LinkedRepo, StoredRepo } from './types.ts'

export type ListReposResult =
  | { ok: true; repos: LinkedRepo[] }
  | { ok: false; error: 'request_failed' }

// Relative `/api/...` URLs only: the UI never talks to GitHub directly.

export type RepoDataResult =
  | { ok: true; data: StoredRepo }
  | { ok: false; error: 'invalid_repo' | 'not_synced' | 'request_failed' }

export type SyncResult =
  | { ok: true; people: number }
  | { ok: false; code: string; message: string }

export type AddRepoError =
  | 'invalid_format'
  | 'duplicate'
  | 'not_found_or_no_access'
  | 'missing_token'
  | 'request_failed'

export type AddRepoResult =
  | { ok: true; repo: string; synced: true; people: number }
  | { ok: true; repo: string; synced: false }
  | { ok: false; error: AddRepoError; repo?: string }

export type RemoveRepoResult = { ok: true } | { ok: false }

export type TokenStatusResult = { ok: true; configured: boolean } | { ok: false }

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
      people?: number
    }
    if (res.ok && body.ok) return { ok: true, people: typeof body.people === 'number' ? body.people : 0 }
    return {
      ok: false,
      code: body.code ?? body.error ?? 'request_failed',
      message: body.message ?? fallback.message,
    }
  } catch {
    return fallback
  }
}

const ADD_ERRORS: readonly string[] = [
  'invalid_format',
  'duplicate',
  'not_found_or_no_access',
  'missing_token',
]

/** Links a repo (`owner/name` or a GitHub URL); the server validates it and runs the first sync. */
export async function addRepo(
  input: string,
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<AddRepoResult> {
  try {
    const res = await fetchImpl('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })
    const body = (await res.json()) as {
      repo?: string
      synced?: boolean
      people?: number
      error?: string
    }
    if (res.ok && typeof body.repo === 'string') {
      if (body.synced === true) {
        return { ok: true, repo: body.repo, synced: true, people: typeof body.people === 'number' ? body.people : 0 }
      }
      return { ok: true, repo: body.repo, synced: false }
    }
    if (body.error && ADD_ERRORS.includes(body.error)) {
      return {
        ok: false,
        error: body.error as AddRepoError,
        ...(typeof body.repo === 'string' ? { repo: body.repo } : {}),
      }
    }
  } catch {
    // fall through
  }
  return { ok: false, error: 'request_failed' }
}

/** Unlinks a repo and deletes its local data; nothing is touched on GitHub. */
export async function removeRepo(
  repo: string,
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<RemoveRepoResult> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) return { ok: false }
  try {
    const res = await fetchImpl(`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (res.ok) return { ok: true }
  } catch {
    // fall through
  }
  return { ok: false }
}

export type GetTeamResult =
  | { ok: true; candidates: Candidate[]; selected: string[] | null; added: string[]; anySynced?: boolean }
  | { ok: false }

export interface TeamSaveInput {
  selected: string[]
  added: string[]
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Reads the team (candidates, chosen logins, hand-added logins) from the local server. */
export async function getTeam(fetchImpl: FetchLike = (...a) => fetch(...a)): Promise<GetTeamResult> {
  try {
    const res = await fetchImpl('/api/team')
    if (res.ok) {
      const body = (await res.json()) as {
        candidates?: unknown
        selected?: unknown
        added?: unknown
        anySynced?: unknown
      }
      if (
        Array.isArray(body.candidates) &&
        (body.selected === null || isStrings(body.selected)) &&
        isStrings(body.added)
      ) {
        return {
          ok: true,
          candidates: body.candidates as Candidate[],
          selected: body.selected,
          added: body.added,
          anySynced: body.anySynced === true,
        }
      }
    }
  } catch {
    // fall through
  }
  return { ok: false }
}

/** Saves the chosen and hand-added logins. Logins only. */
export async function saveTeam(
  team: TeamSaveInput,
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<{ ok: boolean }> {
  try {
    const res = await fetchImpl('/api/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected: team.selected, added: team.added }),
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/** Whether the server has a token. The value itself never reaches the UI. */
export async function getTokenStatus(
  fetchImpl: FetchLike = (...a) => fetch(...a),
): Promise<TokenStatusResult> {
  try {
    const res = await fetchImpl('/api/token-status')
    if (res.ok) {
      const body = (await res.json()) as { configured?: unknown }
      if (typeof body.configured === 'boolean') return { ok: true, configured: body.configured }
    }
  } catch {
    // fall through
  }
  return { ok: false }
}
