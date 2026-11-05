// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runSync } from './sync.ts'
import { createLogger } from './redact.ts'

const TOKEN = 'fake-token-for-tests-4'

function setup() {
  const lines: string[] = []
  const push = (...a: unknown[]) => void lines.push(a.join(' '))
  const log = createLogger(TOKEN, { info: push, warn: push, error: push })
  return { lines, log }
}

const respond = (status: number) =>
  (async () => new Response('{}', { status })) as unknown as typeof fetch

describe('runSync', () => {
  it('AC2: no token returns 1 and mentions GITHUB_TOKEN and .env', async () => {
    const { lines, log } = setup()
    const code = await runSync({ env: {}, fetchImpl: respond(200), log })
    expect(code).toBe(1)
    const out = lines.join('\n')
    expect(out).toContain('GITHUB_TOKEN')
    expect(out).toContain('.env')
  })

  it('AC3: a 401 returns 1, logs "invalid or expired" and never the token', async () => {
    const { lines, log } = setup()
    const code = await runSync({
      env: { GITHUB_TOKEN: TOKEN },
      fetchImpl: respond(401),
      log,
    })
    expect(code).toBe(1)
    const out = lines.join('\n')
    expect(out).toContain('invalid or expired')
    expect(out).not.toContain(TOKEN)
  })

  it('AC1: a valid token returns 0 and says no repositories are linked', async () => {
    const { lines, log } = setup()
    const code = await runSync({
      env: { GITHUB_TOKEN: TOKEN },
      fetchImpl: respond(200),
      log,
    })
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('No repositories linked yet')
  })

  it('AC3: unreachable GitHub returns 1', async () => {
    const { lines, log } = setup()
    const f = (async () => {
      throw new Error(`down ${TOKEN}`)
    }) as unknown as typeof fetch
    const code = await runSync({ env: { GITHUB_TOKEN: TOKEN }, fetchImpl: f, log })
    expect(code).toBe(1)
    expect(lines.join('\n')).not.toContain(TOKEN)
  })
})
