import { describe, expect, it } from 'vitest'
import type { MetricComparison } from './kpiComparison.ts'
import { combineComparisons, trendView } from './trendView.ts'

function cmp(current: number, previous: number): MetricComparison {
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

describe('trendView', () => {
  it('AC1: up shows glyph, signed delta and percent', () => {
    const v = trendView(cmp(28, 25), 'directional', 30)
    expect(v).toMatchObject({ kind: 'trend', glyph: '↑', figure: '+3 (+12%)' })
  })

  it('AC1: down uses U+2212 minus and en-US numbers', () => {
    const v = trendView(cmp(8800, 10000), 'directional', 30)
    expect(v.glyph).toBe('↓')
    expect(v.figure).toBe('−1,200 (−12%)')
  })

  it('AC1: a tiny non-zero change shows "<1%" with its sign', () => {
    expect(trendView(cmp(1001, 1000), 'directional', 30).figure).toBe('+1 (+<1%)')
    expect(trendView(cmp(999, 1000), 'directional', 30).figure).toBe('−1 (−<1%)')
  })

  it('AC1: zero change renders "→ 0 (0%)" in muted for every rule', () => {
    for (const rule of ['directional', 'neutral'] as const) {
      expect(trendView(cmp(5, 5), rule, 30)).toMatchObject({
        glyph: '→',
        figure: '0 (0%)',
        tone: 'muted',
      })
    }
  })

  it('AC2: label names the period', () => {
    expect(trendView(cmp(2, 1), 'directional', 7).label).toBe('vs previous 7 days')
    expect(trendView(cmp(2, 1), 'directional', 90).label).toBe('vs previous 90 days')
  })

  it('AC4: directional up is good, down is caution', () => {
    expect(trendView(cmp(2, 1), 'directional', 30).tone).toBe('good')
    expect(trendView(cmp(1, 2), 'directional', 30).tone).toBe('caution')
  })

  it('AC5: neutral rule (PRs opened) is muted in both directions', () => {
    expect(trendView(cmp(2, 1), 'neutral', 30).tone).toBe('muted')
    expect(trendView(cmp(1, 2), 'neutral', 30).tone).toBe('muted')
  })

  it('AC6: lines changed combines additions and deletions into total churn, neutral', () => {
    const total = combineComparisons(cmp(100, 50), cmp(40, 50))
    expect(total).toMatchObject({ current: 140, previous: 100, delta: 40 })
    expect(total.deltaPct).toBeCloseTo(40)
    const v = trendView(total, 'neutral', 30)
    expect(v).toMatchObject({ glyph: '↑', figure: '+40 (+40%)', tone: 'muted' })
  })

  it('AC6: combined churn with zero previous has no percent', () => {
    expect(combineComparisons(cmp(5, 0), cmp(0, 0)).deltaPct).toBeUndefined()
  })

  it('AC8: undefined comparison gives the quiet none state', () => {
    expect(trendView(undefined, 'directional', 30)).toEqual({
      kind: 'none',
      glyph: '',
      figure: '',
      label: 'No comparison',
      srText: 'No comparison available for the previous period',
      tone: 'muted',
    })
  })

  it('AC8: previous zero (deltaPct undefined) gives none with no numbers', () => {
    const v = trendView(cmp(4, 0), 'directional', 30)
    expect(v.kind).toBe('none')
    expect(v.glyph).toBe('')
    expect(v.figure).toBe('')
  })

  it('AC11: screen-reader sentences', () => {
    expect(trendView(cmp(28, 25), 'directional', 30).srText).toBe('up 12 percent versus previous 30 days')
    expect(trendView(cmp(22, 25), 'directional', 30).srText).toBe('down 12 percent versus previous 30 days')
    expect(trendView(cmp(5, 5), 'directional', 30).srText).toBe('no change versus previous 30 days')
    expect(trendView(cmp(1001, 1000), 'neutral', 7).srText).toBe(
      'up less than 1 percent versus previous 7 days',
    )
  })
})
