import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StoredPullRequest, StoredRepo, StoredReview } from '../src/api/types.ts'

export const DEFAULT_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.data',
)

const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

export function isValidRepo(repo: unknown): repo is string {
  return (
    typeof repo === 'string' &&
    REPO_RE.test(repo) &&
    !repo.endsWith('/.') &&
    !repo.endsWith('/..')
  )
}

export type ConfigResult =
  | { ok: true; repos: string[] }
  | { ok: false; error: string }

/** Reads `<dataDir>/config.json`. A missing file means no repos. */
export async function readConfig(dataDir: string = DEFAULT_DATA_DIR): Promise<ConfigResult> {
  let raw: string
  try {
    raw = await readFile(path.join(dataDir, 'config.json'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, repos: [] }
    return { ok: false, error: 'Could not read .data/config.json.' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: '.data/config.json is not valid JSON.' }
  }
  const repos = (parsed as { repos?: unknown } | null)?.repos
  if (!Array.isArray(repos)) {
    return { ok: false, error: '.data/config.json must look like { "repos": ["owner/name"] }.' }
  }
  const bad = repos.find((r) => !isValidRepo(r))
  if (bad !== undefined) {
    return { ok: false, error: '.data/config.json has an entry that is not in "owner/name" format.' }
  }
  return { ok: true, repos: [...new Set(repos as string[])] }
}

export function repoFilePath(dataDir: string, repo: string): string {
  if (!isValidRepo(repo)) throw new Error('Invalid repo, expected "owner/name".')
  return path.join(dataDir, 'repos', `${repo.replace('/', '__')}.json`)
}

/** Copies only the schema fields, so nothing else can reach disk. */
export function toStored(input: StoredRepo): StoredRepo {
  return {
    schemaVersion: 1,
    repo: input.repo,
    pullRequests: input.pullRequests.map(
      (p): StoredPullRequest => ({
        number: p.number,
        author: p.author,
        state: p.state,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        mergedAt: p.mergedAt,
        closedAt: p.closedAt,
      }),
    ),
    reviews: input.reviews.map(
      (r): StoredReview => ({
        id: r.id,
        pullRequestNumber: r.pullRequestNumber,
        reviewer: r.reviewer,
        state: r.state,
        submittedAt: r.submittedAt,
      }),
    ),
  }
}

/** Local read only, never touches the network. Returns null if not synced. */
export async function readRepo(
  repo: string,
  dataDir: string = DEFAULT_DATA_DIR,
): Promise<StoredRepo | null> {
  try {
    return JSON.parse(await readFile(repoFilePath(dataDir, repo), 'utf8')) as StoredRepo
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Atomic write: temp file in the same directory, then rename. */
export async function writeRepo(
  stored: StoredRepo,
  dataDir: string = DEFAULT_DATA_DIR,
): Promise<void> {
  const file = repoFilePath(dataDir, stored.repo)
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(toStored(stored), null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}
