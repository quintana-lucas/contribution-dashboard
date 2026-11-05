// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { githubGraphql, validateToken } from './github.ts'
import { SYNC_MESSAGES } from './messages.ts'
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

function gql(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  ) as unknown as typeof fetch
}
const run = (f: typeof fetch) => githubGraphql(TOKEN, 'query { x }', { a: 1 }, f)

it('AC5: graphql 200 with data returns ok', async () => {
  expect(await run(gql(200, { data: { x: 1 } }))).toEqual({ ok: true, data: { x: 1 } })
})
it('AC5: 401 -> unauthorized', async () => {
  expect(await run(gql(401, {}))).toEqual({ ok: false, code: 'unauthorized' })
})
it('AC5: 403 with ratelimit-remaining 0 -> rate_limited', async () => {
  expect(await run(gql(403, {}, { 'x-ratelimit-remaining': '0' }))).toEqual({
    ok: false,
    code: 'rate_limited',
  })
})
it('AC5: 429 with retry-after -> rate_limited', async () => {
  expect(await run(gql(429, {}, { 'retry-after': '60' }))).toEqual({
    ok: false,
    code: 'rate_limited',
  })
})
it('AC5: 200 with RATE_LIMITED error -> rate_limited', async () => {
  expect(await run(gql(200, { errors: [{ type: 'RATE_LIMITED' }] }))).toEqual({
    ok: false,
    code: 'rate_limited',
  })
})
it('AC5: other 403 -> forbidden', async () => {
  expect(await run(gql(403, {}))).toEqual({ ok: false, code: 'forbidden' })
})
it('AC5: 200 with NOT_FOUND error -> not_found', async () => {
  const r = await run(gql(200, { data: { repository: null }, errors: [{ type: 'NOT_FOUND' }] }))
  expect(r).toEqual({ ok: false, code: 'not_found' })
})
it('AC5: non-JSON, missing data and other errors -> bad_response', async () => {
  const bad = { ok: false, code: 'bad_response' }
  expect(await run(gql(200, 'not json'))).toEqual(bad)
  expect(await run(gql(200, {}))).toEqual(bad)
  expect(await run(gql(200, { errors: [{ type: 'SOMETHING' }] }))).toEqual(bad)
  expect(await run(gql(500, {}))).toEqual(bad)
})
it('AC5: a throwing fetch containing the token -> network, token nowhere in result', async () => {
  const f = (async () => {
    throw new Error(`boom ${TOKEN}`)
  }) as unknown as typeof fetch
  const r = await run(f)
  expect(r).toEqual({ ok: false, code: 'network' })
  expect(JSON.stringify(r)).not.toContain(TOKEN)
  for (const m of Object.values(SYNC_MESSAGES)) expect(m).not.toContain(TOKEN)
})
it('AC5: not_found message says repo missing or no access', () => {
  expect(SYNC_MESSAGES.not_found).toMatch(/does not exist or the token has no access/)
})
it('AC8: graphql sends POST to /graphql with Bearer header and JSON body via injected fetch', async () => {
  const f = gql(200, { data: {} })
  await run(f)
  const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    RequestInit,
  ]
  expect(url).toBe('https://api.github.com/graphql')
  expect(init.method).toBe('POST')
  const h = init.headers as Record<string, string>
  expect(h.Authorization).toBe(`Bearer ${TOKEN}`)
  expect(h['User-Agent']).toBe('contribution-dashboard')
  expect(JSON.parse(init.body as string)).toEqual({ query: 'query { x }', variables: { a: 1 } })
})
