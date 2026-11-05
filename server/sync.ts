import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readToken } from './config.ts'
import { validateToken } from './github.ts'
import { GITHUB_UNREACHABLE, INVALID_TOKEN, MISSING_TOKEN } from './messages.ts'
import { createLogger } from './redact.ts'
import type { Logger } from './redact.ts'

export interface SyncOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  log?: Logger
}

/** Returns the process exit code. */
export async function runSync({
  env = process.env,
  fetchImpl = fetch,
  log,
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
  logger.info(
    'GitHub token OK. No repositories linked yet; syncing arrives with #7.',
  )
  return 0
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  process.exit(await runSync())
}
