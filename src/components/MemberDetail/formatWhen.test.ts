import { describe, expect, it } from 'vitest'
import { formatWhen } from './formatWhen'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatWhen', () => {
  it('AC4: is relative up to 6 days', () => {
    expect(formatWhen(ago(30_000), NOW)).toBe('just now')
    expect(formatWhen(ago(5 * MIN), NOW)).toBe('5 min ago')
    expect(formatWhen(ago(3 * HOUR), NOW)).toBe('3 h ago')
    expect(formatWhen(ago(1 * DAY + HOUR), NOW)).toBe('1 day ago')
    expect(formatWhen(ago(6 * DAY + HOUR), NOW)).toBe('6 days ago')
  })

  it('AC4: is absolute from 7 days, with the year only when it differs', () => {
    expect(formatWhen('2026-06-03T12:00:00.000Z', NOW)).toBe('Jun 3')
    expect(formatWhen('2025-06-03T12:00:00.000Z', NOW)).toBe('Jun 3, 2025')
  })
})
