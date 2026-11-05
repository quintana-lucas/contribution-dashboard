// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { validateToken } from './github.ts'
import { createLogger } from './redact.ts'

const TOKEN = 'fake-token-for-tests-3'

function stub(status: number) {
  return vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch
}

it('AC1: validateToken sends the Bearer header to /rate_limit and returns valid on 200', async () => {
  const f = stub(200)
  expect(await validateToken(TOKEN, f)).toBe('valid')
  const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock
    .calls[0] as [string, RequestInit]
  expect(url).toBe('https://api.github.com/rate_limit')
  const h = init.headers as Record<string, string>
  expect(h.Authorization).toBe(`Bearer ${TOKEN}`)
  expect(h.Accept).toBe('application/vnd.github+json')
  expect(h['X-GitHub-Api-Version']).toBe('2022-11-28')
  expect(h['User-Agent']).toBeTruthy()
})

it('AC3: a 401 makes validateToken return invalid', async () => {
  expect(await validateToken(TOKEN, stub(401))).toBe('invalid')
})

it('AC3: other statuses are unreachable', async () => {
  expect(await validateToken(TOKEN, stub(500))).toBe('unreachable')
})

it('AC5: a rejecting fetch with the token in its message gives unreachable and leaks nothing', async () => {
  const f = (async () => {
    throw new Error(`connect failed for ${TOKEN}`)
  }) as unknown as typeof fetch
  const lines: string[] = []
  const push = (...a: unknown[]) => void lines.push(a.join(' '))
  const log = createLogger(TOKEN, { info: push, warn: push, error: push })
  const result = await validateToken(TOKEN, f)
  expect(result).toBe('unreachable')
  log.error(`result: ${result}`)
  for (const l of lines) expect(l).not.toContain(TOKEN)
})
