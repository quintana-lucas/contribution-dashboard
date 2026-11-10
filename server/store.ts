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

/** Atomic write of `<dataDir>/config.json` as `{ "repos": [...] }`. */
export async function writeConfig(
  repos: string[],
  dataDir: string = DEFAULT_DATA_DIR,
): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  const file = path.join(dataDir, 'config.json')
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify({ repos }, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}

const REPO_INPUT_RE =
  /^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i

/** Parses `owner/name` or a github.com URL form. Returns null when not valid. */
export function parseRepoInput(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const match = REPO_INPUT_RE.exec(input.trim())
  if (!match) return null
  const repo = `${match[1]}/${match[2]}`
  return isValidRepo(repo) ? repo : null
}

export function repoFilePath(dataDir: string, repo: string): string {
  if (!isValidRepo(repo)) throw new Error('Invalid repo, expected "owner/name".')
  return path.join(dataDir, 'repos', `${repo.replace('/', '__')}.json`)
}

/** Copies only the schema fields, so nothing else can reach disk. */
export function toStored(input: StoredRepo): StoredRepo {
  return {
    schemaVersion: 2,
    repo: input.repo,
    syncedAt: input.syncedAt,
    pullRequests: input.pullRequests.map(
      (p): StoredPullRequest => ({
        number: p.number,
        author: p.author,
        authorIsBot: p.authorIsBot,
        state: p.state,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        mergedAt: p.mergedAt,
        closedAt: p.closedAt,
        additions: p.additions,
        deletions: p.deletions,
        baseBranch: p.baseBranch,
        requestedReviewers: p.requestedReviewers.map((q) =>
          q.kind === 'team'
            ? { kind: 'team', slug: q.slug }
            : { kind: 'user', login: q.login, isBot: q.isBot },
        ),
      }),
    ),
    reviews: input.reviews.map(
      (r): StoredReview => ({
        id: r.id,
        pullRequestNumber: r.pullRequestNumber,
        reviewer: r.reviewer,
        reviewerIsBot: r.reviewerIsBot,
        outcome: r.outcome,
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
    const parsed = JSON.parse(await readFile(repoFilePath(dataDir, repo), 'utf8')) as StoredRepo
    // Files from an older schema lack the newer fields; treat them as not synced
    // so the user re-runs `npm run sync` instead of the UI reading partial data.
    if (parsed?.schemaVersion !== 2) return null
    return parsed
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
