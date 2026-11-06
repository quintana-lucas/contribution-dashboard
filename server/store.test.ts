// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../src/api/types.ts'
import { readConfig, readRepo, writeRepo } from './store.ts'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'store-test-'))
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(dir, { recursive: true, force: true })
})

const sample: StoredRepo = {
  schemaVersion: 2,
  repo: 'acme/widgets',
  syncedAt: '2026-06-01T00:00:00.000Z',
  pullRequests: [
    {
      number: 1,
      author: 'fake-author',
      authorIsBot: false,
      state: 'merged',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
      mergedAt: '2026-05-02T00:00:00Z',
      closedAt: '2026-05-02T00:00:00Z',
      additions: 5,
      deletions: 2,
      baseBranch: 'main',
      requestedReviewers: [{ kind: 'team', slug: 'core' }],
    },
  ],
  reviews: [
    { id: 'R1', pullRequestNumber: 1, reviewer: 'rev', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-05-02T00:00:00Z' },
  ],
}

describe('store', () => {
  it('AC2: write then read returns equal data without any network call', async () => {
    const f = vi.fn(() => {
      throw new Error('network used')
    })
    vi.stubGlobal('fetch', f)
    await writeRepo(sample, dir)
    expect(await readRepo('acme/widgets', dir)).toEqual(sample)
    expect(f).not.toHaveBeenCalled()
  })

  it('AC2: readRepo returns null when the repo was never synced', async () => {
    expect(await readRepo('acme/widgets', dir)).toBeNull()
  })

  it('AC6: file lands in <dataDir>/repos/<owner>__<name>.json and no temp file remains', async () => {
    await writeRepo(sample, dir)
    expect(await readdir(path.join(dir, 'repos'))).toEqual(['acme__widgets.json'])
  })

  it('AC6: only whitelisted keys are persisted, extra fields are dropped', async () => {
    const dirty = JSON.parse(JSON.stringify(sample))
    dirty.pullRequests[0].email = 'a@b.c'
    dirty.pullRequests[0].body = 'secret body'
    dirty.reviews[0].token = 'fake-token-for-tests-7'
    dirty.extra = 'x'
    await writeRepo(dirty, dir)
    const text = await readFile(path.join(dir, 'repos', 'acme__widgets.json'), 'utf8')
    expect(text).not.toMatch(/a@b\.c|secret body|fake-token-for-tests-7|extra/)
    expect(JSON.parse(text)).toEqual(sample)
  })

  it('#13 AC5: toStored drops unknown fields at PR, review and requested-reviewer level', async () => {
    const dirty = JSON.parse(JSON.stringify(sample))
    dirty.pullRequests[0].email = 'a@b.c'
    dirty.pullRequests[0].requestedReviewers = [
      { kind: 'team', slug: 'core', email: 'team@b.c' },
      { kind: 'user', login: 'u', isBot: false, token: 'fake-token-for-tests-13', email: 'u@b.c' },
    ]
    dirty.reviews[0].email = 'r@b.c'
    dirty.reviews[0].token = 'fake-token-for-tests-13'
    await writeRepo(dirty, dir)
    const text = await readFile(path.join(dir, 'repos', 'acme__widgets.json'), 'utf8')
    expect(text).not.toMatch(/@|fake-token/)
    const stored = JSON.parse(text)
    expect(stored.pullRequests[0].requestedReviewers).toEqual([
      { kind: 'team', slug: 'core' },
      { kind: 'user', login: 'u', isBot: false },
    ])
    expect(Object.keys(stored.pullRequests[0]).sort()).toEqual(
      Object.keys(sample.pullRequests[0]).sort(),
    )
    expect(Object.keys(stored.reviews[0]).sort()).toEqual(Object.keys(sample.reviews[0]).sort())
  })

  it('#13 AC5: .data/ is gitignored', async () => {
    const ignore = await readFile(path.resolve(import.meta.dirname, '..', '.gitignore'), 'utf8')
    expect(ignore.split(/\r?\n/)).toContain('.data/')
  })

  it('#13 AC3: syncedAt is stored and read back', async () => {
    await writeRepo(sample, dir)
    expect((await readRepo('acme/widgets', dir))?.syncedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('#13 AC5: a file with an older schemaVersion reads as not synced', async () => {
    await mkdir(path.join(dir, 'repos'), { recursive: true })
    await writeFile(
      path.join(dir, 'repos', 'acme__widgets.json'),
      JSON.stringify({ schemaVersion: 1, repo: 'acme/widgets', pullRequests: [], reviews: [] }),
    )
    expect(await readRepo('acme/widgets', dir)).toBeNull()
  })

  it('AC6: rejects a repo name that could escape the data dir', async () => {
    await expect(writeRepo({ ...sample, repo: '../evil/x' }, dir)).rejects.toThrow()
  })

  it('config: missing file means no repos', async () => {
    expect(await readConfig(dir)).toEqual({ ok: true, repos: [] })
  })

  it('config: reads repos and rejects invalid format', async () => {
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ repos: ['acme/widgets'] }))
    expect(await readConfig(dir)).toEqual({ ok: true, repos: ['acme/widgets'] })
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ repos: ['nope'] }))
    expect((await readConfig(dir)).ok).toBe(false)
    await writeFile(path.join(dir, 'config.json'), '{not json')
    expect((await readConfig(dir)).ok).toBe(false)
  })
})
