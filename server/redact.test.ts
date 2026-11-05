// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createLogger, redact } from './redact.ts'

const SECRET = 'fake-token-for-tests-2'

function sink() {
  const lines: string[] = []
  const push = (...a: unknown[]) => void lines.push(a.join(' '))
  return { lines, info: push, warn: push, error: push }
}

describe('AC5: redaction', () => {
  it('AC5: redact replaces every occurrence', () => {
    expect(redact(`a ${SECRET} b ${SECRET}`, SECRET)).toBe(
      'a [REDACTED] b [REDACTED]',
    )
  })

  it('AC5: redact is a no-op without a secret', () => {
    expect(redact('hello', undefined)).toBe('hello')
    expect(redact('hello', '')).toBe('hello')
  })

  it('AC5: logger redacts strings, Error messages and stacks, on every level', () => {
    const s = sink()
    const log = createLogger(SECRET, s)
    const err = new Error(`boom ${SECRET}`)
    err.stack = `Error: boom\n    at ${SECRET}`
    log.info(`token ${SECRET}`)
    log.warn(err)
    log.error({ t: SECRET })
    expect(s.lines).toHaveLength(3)
    for (const line of s.lines) expect(line).not.toContain(SECRET)
    expect(s.lines[0]).toContain('[REDACTED]')
    expect(s.lines[1]).toContain('[REDACTED]')
    expect(s.lines[2]).toContain('[REDACTED]')
  })
})
