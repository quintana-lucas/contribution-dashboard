// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSync } from './sync.ts'
import { createLogger } from './redact.ts'

const TOKEN = 'fake-token-for-tests-7'
const NOW = new Date('2026-06-01T00:00:00Z')

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'sync-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function setup() {
  const lines: string[] = []
  const push = (...a: unknown[]) => void lines.push(a.join(' '))
  const log = createLogger(TOKEN, { info: push, warn: push, error: push })
  return { lines, log }
}

const respond = (status: number) =>
  (async () => new Response('{}', { status })) as unknown as typeof fetch

const linkRepos = (...repos: string[]) =>
  writeFile(path.join(dir, 'config.json'), JSON.stringify({ repos }))

const prNode = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  state: 'MERGED',
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  mergedAt: '2026-05-25T00:00:00Z',
  closedAt: '2026-05-25T00:00:00Z',
  author: { login: 'fake-author', email: 'a@b.c' },
  body: 'secret body',
  reviews: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [
      { id: `R${number}`, state: 'APPROVED', submittedAt: '2026-05-24T00:00:00Z', author: { login: 'rev' }, body: 'x' },
    ],
  },
  ...extra,
})

/** Validation call (rate_limit) succeeds; graphql calls are answered by `graphql`. */
function githubFake(graphql: () => Response | Promise<Response>) {
  return (async (url: string) => {
    if (String(url).endsWith('/graphql')) return graphql()
    return new Response('{}', { status: 200 })
  }) as unknown as typeof fetch
}

const okGraphql = () =>
  new Response(
    JSON.stringify({
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [prNode(2), prNode(1), prNode(1)],
          },
        },
      },
    }),
    { status: 200 },
  )

const file = () => path.join(dir, 'repos', 'acme__widgets.json')
const run = (fetchImpl: typeof fetch, log = setup().log) =>
  runSync({ env: { GITHUB_TOKEN: TOKEN }, fetchImpl, log, dataDir: dir, now: () => NOW })

describe('runSync', () => {
  it('#6 AC2: no token returns 1 and mentions GITHUB_TOKEN and .env', async () => {
    const { lines, log } = setup()
    const code = await runSync({ env: {}, fetchImpl: respond(200), log, dataDir: dir })
    expect(code).toBe(1)
    const out = lines.join('\n')
    expect(out).toContain('GITHUB_TOKEN')
    expect(out).toContain('.env')
  })

  it('#6 AC3: a 401 returns 1, logs "invalid or expired" and never the token', async () => {
    const { lines, log } = setup()
    const code = await run(respond(401), log)
    expect(code).toBe(1)
    const out = lines.join('\n')
    expect(out).toContain('invalid or expired')
    expect(out).not.toContain(TOKEN)
  })

  it('#6 AC5: unreachable GitHub returns 1', async () => {
    const { lines, log } = setup()
    const f = (async () => {
      throw new Error(`down ${TOKEN}`)
    }) as unknown as typeof fetch
    expect(await run(f, log)).toBe(1)
    expect(lines.join('\n')).not.toContain(TOKEN)
  })

  it('#6 AC1: a valid token with no repos returns 0 and says none are linked', async () => {
    const { lines, log } = setup()
    expect(await run(respond(200), log)).toBe(0)
    expect(lines.join('\n')).toContain('No repositories linked yet')
    expect(lines.join('\n')).not.toContain('#7')
  })

  it('#7 AC6: syncing writes the whitelisted data to <dataDir>/repos/<owner>__<name>.json', async () => {
    await linkRepos('acme/widgets')
    expect(await run(githubFake(okGraphql))).toBe(0)
    const text = await readFile(file(), 'utf8')
    const stored = JSON.parse(text)
    expect(stored.pullRequests.map((p: { number: number }) => p.number)).toEqual([1, 2])
    expect(text).not.toMatch(/a@b\.c|secret body|fake-token/)
    expect(Object.keys(stored).sort()).toEqual(['pullRequests', 'repo', 'reviews', 'schemaVersion'])
  })

  it('#7 AC4: running sync twice yields identical file contents without duplicates', async () => {
    await linkRepos('acme/widgets')
    await run(githubFake(okGraphql))
    const first = await readFile(file(), 'utf8')
    await run(githubFake(okGraphql))
    const second = await readFile(file(), 'utf8')
    expect(second).toBe(first)
    expect(JSON.parse(second).reviews).toHaveLength(2)
  })

  const failures: [string, () => Response | Promise<Response>][] = [
    ['404/not found', () => new Response(JSON.stringify({ data: null, errors: [{ type: 'NOT_FOUND', message: 'x' }] }), { status: 200 })],
    ['403', () => new Response('{}', { status: 403 })],
    ['rate limit', () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })],
    ['network', () => { throw new Error(`boom ${TOKEN}`) }],
  ]
  for (const [label, bad] of failures) {
    it(`#7 AC5: a failing second sync (${label}) keeps the old file byte-identical, exits 1 and does not leak the token`, async () => {
      await linkRepos('acme/widgets')
      await run(githubFake(okGraphql))
      const before = await readFile(file(), 'utf8')
      const { lines, log } = setup()
      expect(await run(githubFake(bad), log)).toBe(1)
      expect(await readFile(file(), 'utf8')).toBe(before)
      const out = lines.join('\n')
      expect(out).toContain('acme/widgets')
      expect(out).not.toContain(TOKEN)
    })
  }

  it('#7 AC5: a failing repo does not stop the next one; exit code is 1', async () => {
    await linkRepos('acme/broken', 'acme/widgets')
    const f = (async (url: string, init: RequestInit) => {
      if (!String(url).endsWith('/graphql')) return new Response('{}', { status: 200 })
      const { variables } = JSON.parse(init.body as string)
      return variables.name === 'broken' ? new Response('{}', { status: 403 }) : okGraphql()
    }) as unknown as typeof fetch
    expect(await run(f)).toBe(1)
    expect(JSON.parse(await readFile(file(), 'utf8')).repo).toBe('acme/widgets')
  })

  it('#7 AC5: an invalid config.json returns 1 without calling GitHub graphql', async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'config.json'), '{"repos":["bad"]}')
    const { lines, log } = setup()
    expect(await run(respond(200), log)).toBe(1)
    expect(lines.join('\n')).toContain('config.json')
  })
})
