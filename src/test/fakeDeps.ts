import { vi } from 'vitest'
import type { GetTeamResult } from '../api/client'
import type { StoredRepo } from '../api/types'

export const NOW = new Date('2026-06-15T12:00:00.000Z')

export function storedRepo(repo: string, syncedAt: string, authors: string[], base = 'main'): StoredRepo {
  return {
    schemaVersion: 2,
    repo,
    syncedAt,
    pullRequests: authors.map((author, i) => ({
      number: i + 1,
      author,
      authorIsBot: false,
      state: 'open' as const,
      createdAt: '2026-06-10T10:00:00.000Z',
      updatedAt: '2026-06-10T10:00:00.000Z',
      mergedAt: null,
      closedAt: null,
      additions: 1,
      deletions: 1,
      baseBranch: base,
      requestedReviewers: [],
    })),
    reviews: [],
  }
}

/** Fake injectable deps: two synced repos and one never synced. */
export function makeDeps() {
  const data: Record<string, StoredRepo> = {
    'acme/api': storedRepo('acme/api', '2026-06-15T09:00:00.000Z', ['ana', 'bob'], 'develop'),
    'acme/web': storedRepo('acme/web', '2026-06-15T11:30:00.000Z', ['ana', 'cy', 'dee']),
  }
  const listRepos = vi.fn(async () => ({
    ok: true as const,
    repos: [
      { repo: 'acme/api', syncedAt: '2026-06-15T09:00:00.000Z', baseBranch: 'main', people: 2 },
      { repo: 'acme/web', syncedAt: '2026-06-15T11:30:00.000Z', baseBranch: 'main', people: 2 },
      { repo: 'acme/new', syncedAt: null, baseBranch: null, people: null },
    ],
  }))
  const getRepoData = vi.fn(async (repo: string) => ({ ok: true as const, data: data[repo] }))
  const addRepo = vi.fn(async (input: string) => ({
    ok: true as const,
    repo: input,
    synced: true as const,
    people: 2,
  }))
  const removeRepo = vi.fn(async (_repo: string) => ({ ok: true as const }))
  const syncRepo = vi.fn(async (_repo: string) => ({ ok: true as const, people: 2 }))
  const getTokenStatus = vi.fn(async () => ({ ok: true as const, configured: true }))
  // The team is already chosen (everyone), so the dashboard shows instead of the empty state.
  const getTeam = vi.fn(
    async (): Promise<GetTeamResult> => ({
      ok: true,
      candidates: ['ana', 'bob', 'cy', 'dee'].map((login) => ({
        login,
        pullRequests: 1,
        reviews: 0,
        repos: ['acme/api'],
      })),
      selected: ['ana', 'bob', 'cy', 'dee'],
      added: [],
    }),
  )
  const saveTeam = vi.fn(async (_team: { selected: string[]; added: string[] }) => ({ ok: true }))
  return {
    listRepos,
    getRepoData,
    addRepo,
    removeRepo,
    syncRepo,
    getTokenStatus,
    getTeam,
    saveTeam,
    now: () => NOW,
  }
}
