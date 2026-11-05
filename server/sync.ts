import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readToken } from './config.ts'
import { validateToken } from './github.ts'
import { fetchRepoActivity } from './fetchRepo.ts'
import { GITHUB_UNREACHABLE, INVALID_TOKEN, MISSING_TOKEN, SYNC_MESSAGES } from './messages.ts'
import { DEFAULT_DATA_DIR, readConfig, writeRepo } from './store.ts'
import { createLogger } from './redact.ts'
import type { Logger } from './redact.ts'

export interface SyncOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  log?: Logger
  dataDir?: string
  now?: () => Date
}

/** Returns the process exit code. */
export async function runSync({
  env = process.env,
  fetchImpl = fetch,
  log,
  dataDir = DEFAULT_DATA_DIR,
  now = () => new Date(),
}: SyncOptions = {}): Promise<number> {
  const token = readToken(env)
  const logger = log ?? createLogger(token)
  if (!token) {
    logger.error(MISSING_TOKEN)
    return 1
  }
  const result = await validateToken(token, fetchImpl)
  if (result === 'invalid') {
    logger.error(INVALID_TOKEN)
    return 1
  }
  if (result === 'unreachable') {
    logger.error(GITHUB_UNREACHABLE)
    return 1
  }
  const config = await readConfig(dataDir)
  if (!config.ok) {
    logger.error(config.error)
    return 1
  }
  if (config.repos.length === 0) {
    logger.info(
      'GitHub token OK. No repositories linked yet; add them to .data/config.json as { "repos": ["owner/name"] }.',
    )
    return 0
  }
  let failed = 0
  for (const repo of config.repos) {
    const [owner, name] = repo.split('/')
    const res = await fetchRepoActivity({ token, owner, name, now: now(), fetchImpl })
    if (!res.ok) {
      failed++
      logger.error(`${repo}: sync failed. ${SYNC_MESSAGES[res.code]}`)
      continue
    }
    try {
      await writeRepo(res.repo, dataDir)
    } catch {
      failed++
      logger.error(`${repo}: could not write the local data file.`)
      continue
    }
    logger.info(
      `${repo}: synced ${res.repo.pullRequests.length} pull requests and ${res.repo.reviews.length} reviews.`,
    )
  }
  return failed > 0 ? 1 : 0
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  process.exit(await runSync())
}
