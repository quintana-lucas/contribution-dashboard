import type { ServerResponse } from 'node:http'
import type { ApiRoutes } from './app.ts'
import { MISSING_TOKEN, SYNC_MESSAGES } from './messages.ts'
import { DEFAULT_DATA_DIR, isValidRepo, readConfig, readRepo } from './store.ts'
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

export function createApiRoutes({
  getToken,
  dataDir = DEFAULT_DATA_DIR,
  fetchImpl = fetch,
  now = () => new Date(),
}: ApiOptions): ApiRoutes {
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
        json(res, 200, { ok: true })
      },
    },
  }
}
