import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard.ts'
import { HISTORY_DAYS, hasPreviousWindowHistory } from './kpiComparison.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const SYNCED = new Date('2026-06-15T12:00:00.000Z')

function entry(repo: string, syncedAt: Date | null): RepoEntry {
  if (syncedAt === null) return { repo, syncedAt: null, data: null }
  const iso = syncedAt.toISOString()
  return { repo, syncedAt: iso, data: { schemaVersion: 3, repo, syncedAt: iso, pullRequests: [], reviews: [] } }
}

describe('hasPreviousWindowHistory', () => {
  it('AC6: with about 90 days of history, 90d is insufficient and 7d is available', () => {
    const entries = [entry('acme/api', SYNCED)]
    expect(hasPreviousWindowHistory(entries, 'all', 90, SYNCED)).toBe(false)
    expect(hasPreviousWindowHistory(entries, 'all', 7, SYNCED)).toBe(true)
  })

  it('AC6: 30d is available only when the history covers 60 days', () => {
    const entries = [entry('acme/api', SYNCED)]
    expect(HISTORY_DAYS).toBe(90)
    expect(hasPreviousWindowHistory(entries, 'all', 30, SYNCED)).toBe(true)
    // now = syncedAt - 30d: previous window starts exactly at the history start -> covered.
    const edge = new Date(SYNCED.getTime() - 30 * DAY_MS)
    expect(hasPreviousWindowHistory(entries, 'all', 30, edge)).toBe(true)
    // Just outside: one ms before the edge, the previous window starts before the history does.
    const outside = new Date(edge.getTime() - 1)
    expect(hasPreviousWindowHistory(entries, 'all', 30, outside)).toBe(false)
  })

  it('AC5: history reaching back less than 2 periods is insufficient', () => {
    // Synced 20 days after "now": history starts 70 days before now, enough for 30d (60) not 90d.
    const entries = [entry('acme/api', new Date(SYNCED.getTime() + 20 * DAY_MS))]
    expect(hasPreviousWindowHistory(entries, 'all', 30, SYNCED)).toBe(true)
    const later = [entry('acme/api', new Date(SYNCED.getTime() + 31 * DAY_MS))]
    expect(hasPreviousWindowHistory(later, 'all', 30, SYNCED)).toBe(false)
  })

  it('AC7: a selected repo with short history makes it false; an unselected one does not', () => {
    const entries = [
      entry('acme/api', new Date(SYNCED.getTime() - 60 * DAY_MS)),
      entry('acme/web', SYNCED),
    ]
    const now = SYNCED
    expect(hasPreviousWindowHistory(entries, 'all', 30, now)).toBe(true)
    const short = [entry('acme/api', SYNCED), entry('acme/web', new Date(SYNCED.getTime() + 60 * DAY_MS))]
    // acme/web (synced later) has a later history start, so 30d is not covered for it.
    expect(hasPreviousWindowHistory(short, 'all', 30, now)).toBe(false)
    expect(hasPreviousWindowHistory(short, 'acme/api', 30, now)).toBe(true)
    expect(hasPreviousWindowHistory(short, 'acme/web', 30, now)).toBe(false)
  })

  it('AC5: repos without data are ignored, and no data at all is insufficient', () => {
    const none = [entry('acme/new', null)]
    expect(hasPreviousWindowHistory(none, 'all', 7, SYNCED)).toBe(false)
    expect(hasPreviousWindowHistory([], 'all', 7, SYNCED)).toBe(false)
    const mixed = [entry('acme/new', null), entry('acme/api', SYNCED)]
    expect(hasPreviousWindowHistory(mixed, 'all', 7, SYNCED)).toBe(true)
    expect(hasPreviousWindowHistory(mixed, 'acme/new', 7, SYNCED)).toBe(false)
  })
})
