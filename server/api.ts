import type { ServerResponse } from 'node:http'
import type { ApiRoutes } from './app.ts'
import { rm } from 'node:fs/promises'
import { baseBranch } from '../src/api/dashboard.ts'
import { people } from '../src/api/people.ts'
import type { StoredRepo } from '../src/api/types.ts'
import { candidates, isValidLogin } from '../src/api/team.ts'
import { readInputBody, readJsonBody } from './body.ts'
import { githubGraphql } from './github.ts'
import { MISSING_TOKEN, SYNC_MESSAGES } from './messages.ts'
import {
  DEFAULT_DATA_DIR,
  isValidRepo,
  parseRepoInput,
  readConfig,
  readRepo,
  readTeam,
  repoFilePath,
  writeConfig,
  writeTeam,
} from './store.ts'
import { syncRepo } from './sync.ts'

export interface ApiOptions {
  /** Returns the token, which stays in the server process. */
  getToken: () => string | undefined
  dataDir?: string
  fetchImpl?: typeof fetch
  now?: () => Date
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const MAX_TEAM_LIST = 1000

/** Valid logins only, at most 1000, deduped case-insensitively. Null when invalid. */
function dedupeLogins(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TEAM_LIST) return null
  if (!value.every(isValidLogin)) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const login of value as string[]) {
    const key = login.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(login)
  }
  return out
}

export function createApiRoutes({
  getToken,
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  now = () => new Date(),
}: ApiOptions): ApiRoutes {
  // Serializes config read-modify-write so concurrent requests cannot lose an entry.
  let queue: Promise<unknown> = Promise.resolve()
  function mutateConfig<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn)
    queue = run.catch(() => undefined)
    return run
  }
  let teamQueue: Promise<unknown> = Promise.resolve()
  function mutateTeam<T>(fn: () => Promise<T>): Promise<T> {
    const run = teamQueue.then(fn, fn)
    teamQueue = run.catch(() => undefined)
    return run
  }
  const findLinked = (repos: string[], repo: string) =>
    repos.find((r) => r.toLowerCase() === repo.toLowerCase())

  return {
    '/api/data': {
      // Reads the local store only; never touches the network.
      GET: async (req, res) => {
        const repo = new URL(req.url ?? '/', 'http://localhost').searchParams.get('repo')
        if (!isValidRepo(repo)) {
          json(res, 400, { error: 'invalid_repo' })
          return
        }
        const stored = await readRepo(repo, dataDir)
        if (!stored) {
          json(res, 404, { error: 'not_synced' })
          return
        }
        json(res, 200, stored)
      },
    },
    // Local store only, never the network. #8 extends this route (POST/DELETE).
    '/api/repos': {
      GET: async (_req, res) => {
        const config = await readConfig(dataDir)
        if (!config.ok) {
          json(res, 500, { error: 'config_invalid' })
          return
        }
        const repos = await Promise.all(
          config.repos.map(async (repo) => {
            const stored = await readRepo(repo, dataDir).catch(() => null)
            return {
              repo,
              syncedAt: stored?.syncedAt ?? null,
              baseBranch: stored ? baseBranch(stored) : null,
              people: stored ? people(stored) : null,
            }
          }),
        )
        json(res, 200, { repos })
      },
      POST: async (req, res) => {
        const body = await readInputBody(req)
        if (!body.ok) {
          json(res, body.status, { error: body.error })
          return
        }
        const parsed = parseRepoInput(body.input)
        if (!parsed) {
          json(res, 400, { error: 'invalid_format' })
          return
        }
        const config = await readConfig(dataDir)
        if (!config.ok) {
          json(res, 500, { error: 'config_invalid' })
          return
        }
        const existing = findLinked(config.repos, parsed)
        if (existing) {
          json(res, 409, { error: 'duplicate', repo: existing })
          return
        }
        const token = getToken()
        if (!token) {
          json(res, 503, { error: 'missing_token' })
          return
        }
        const [owner, name] = parsed.split('/')
        const check = await githubGraphql<{ repository: { nameWithOwner: string } | null }>(
          token,
          'query RepoExists($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { nameWithOwner } }',
          { owner, name },
          fetchImpl,
        )
        if (!check.ok) {
          if (check.code === 'not_found' || check.code === 'forbidden') {
            json(res, 404, { error: 'not_found_or_no_access' })
          } else {
            json(res, 502, { error: 'github_failed' })
          }
          return
        }
        const canonical = check.data.repository?.nameWithOwner
        if (!isValidRepo(canonical)) {
          json(res, canonical === undefined || canonical === null ? 404 : 502, {
            error: canonical === undefined || canonical === null ? 'not_found_or_no_access' : 'github_failed',
          })
          return
        }
        const added = await mutateConfig(async () => {
          const current = await readConfig(dataDir)
          if (!current.ok) return { status: 500 as const, error: 'config_invalid' }
          const dup = findLinked(current.repos, canonical)
          if (dup) return { status: 409 as const, error: 'duplicate', repo: dup }
          await writeConfig([...current.repos, canonical], dataDir)
          return null
        })
        if (added) {
          const { status, ...rest } = added
          json(res, status, rest)
          return
        }
        const result = await syncRepo({ token, repo: canonical, dataDir, fetchImpl, now: now() })
        if (!result.ok) {
          json(res, 201, { repo: canonical, synced: false, code: result.code })
          return
        }
        const data = await readRepo(canonical, dataDir).catch(() => null)
        json(res, 201, { repo: canonical, synced: true, people: data ? people(data) : 0 })
      },
    },
    // Local store only, never the network.
    '/api/team': {
      GET: async (_req, res) => {
        const config = await readConfig(dataDir)
        if (!config.ok) {
          json(res, 500, { error: 'config_invalid' })
          return
        }
        const team = await readTeam(dataDir)
        if (!team.ok) {
          json(res, 500, { error: 'team_invalid' })
          return
        }
        const stored = await Promise.all(config.repos.map((r) => readRepo(r, dataDir).catch(() => null)))
        const synced = stored.filter((s): s is StoredRepo => s !== null)
        json(res, 200, {
          candidates: candidates(synced, now()),
          selected: team.selected,
          added: team.added,
          anySynced: synced.length > 0,
        })
      },
      PUT: async (req, res) => {
        const body = await readJsonBody(req)
        if (!body.ok) {
          json(res, body.status, { error: body.error })
          return
        }
        const value = body.value as { selected?: unknown; added?: unknown } | null
        const selected = dedupeLogins(value?.selected)
        const added = dedupeLogins(value?.added)
        if (!selected || !added) {
          json(res, 400, { error: 'invalid_team' })
          return
        }
        try {
          await mutateTeam(() => writeTeam({ selected, added }, dataDir))
        } catch {
          json(res, 500, { error: 'write_failed' })
          return
        }
        json(res, 200, { ok: true })
      },
    },
    '/api/repos/:owner/:name': {
      DELETE: async (_req, res, params) => {
        const repo = `${params.owner}/${params.name}`
        if (!isValidRepo(repo)) {
          json(res, 400, { error: 'invalid_repo' })
          return
        }
        const outcome = await mutateConfig(async () => {
          const current = await readConfig(dataDir)
          if (!current.ok) return 'config_invalid' as const
          const stored = findLinked(current.repos, repo)
          if (!stored) return 'not_linked' as const
          await writeConfig(
            current.repos.filter((r) => r !== stored),
            dataDir,
          )
          return { removed: stored }
        })
        if (outcome === 'config_invalid') {
          json(res, 500, { error: 'config_invalid' })
          return
        }
        if (outcome === 'not_linked') {
          json(res, 404, { error: 'not_linked' })
          return
        }
        await rm(repoFilePath(dataDir, outcome.removed), { force: true })
        json(res, 200, { ok: true })
      },
    },
    '/api/repos/:owner/:name/sync': {
      POST: async (_req, res, params) => {
        const repo = `${params.owner}/${params.name}`
        if (!isValidRepo(repo)) {
          json(res, 400, { error: 'invalid_repo' })
          return
        }
        const token = getToken()
        if (!token) {
          json(res, 503, { ok: false, code: 'missing_token', message: MISSING_TOKEN })
          return
        }
        const config = await readConfig(dataDir)
        if (!config.ok || !config.repos.includes(repo)) {
          json(res, 404, { error: 'not_linked' })
          return
        }
        const result = await syncRepo({ token, repo, dataDir, fetchImpl, now: now() })
        if (!result.ok) {
          json(res, 502, {
            ok: false,
            code: result.code,
            message:
              result.code === 'write_failed'
                ? 'Could not write the local data file.'
                : SYNC_MESSAGES[result.code],
          })
          return
        }
        const data = await readRepo(repo, dataDir).catch(() => null)
        json(res, 200, { ok: true, people: data ? people(data) : 0 })
      },
    },
  }
}
