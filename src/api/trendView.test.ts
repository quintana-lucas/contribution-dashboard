import { describe, expect, it } from 'vitest'
import type { MetricComparison } from './kpiComparison.ts'
import { combineComparisons, metricOf, trendView } from './trendView.ts'

describe('metricOf', () => {
  it('AC8: returns the metric when available and undefined on insufficient history', () => {
    const m = { current: 2, previous: 1, delta: 1, deltaPct: 100 }
    const metrics = { mergedPrs: m, reviews: m, prsOpened: m, additions: m, deletions: m }
    expect(metricOf({ status: 'available', metrics }, 'reviews')).toBe(m)
    expect(metricOf({ status: 'insufficient_history' }, 'reviews')).toBeUndefined()
  })
})

function cmp(current: number, previous: number): MetricComparison {
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

describe('trendView', () => {
  it('AC1: up shows glyph, signed delta and percent', () => {
    const v = trendView(cmp(28, 25), 30)
    expect(v).toMatchObject({ kind: 'trend', glyph: '↑', figure: '+3 (+12%)' })
  })

  it('AC1: down uses U+2212 minus and en-US numbers', () => {
    const v = trendView(cmp(8800, 10000), 30)
    expect(v.glyph).toBe('↓')
    expect(v.figure).toBe('−1,200 (−12%)')
  })

  it('AC1: a tiny non-zero change shows "<1%" with its sign', () => {
    expect(trendView(cmp(1001, 1000), 30).figure).toBe('+1 (+<1%)')
    expect(trendView(cmp(999, 1000), 30).figure).toBe('−1 (−<1%)')
  })

  it('AC1: zero change renders "→ 0 (0%)" in muted', () => {
    expect(trendView(cmp(5, 5), 30)).toMatchObject({
      glyph: '→',
      figure: '0 (0%)',
      tone: 'muted',
    })
  })

  it('AC2: label names the period', () => {
    expect(trendView(cmp(2, 1), 7).label).toBe('vs previous 7 days')
    expect(trendView(cmp(2, 1), 90).label).toBe('vs previous 90 days')
  })

  it('#122 AC8: every metric is good for +, bad for -, muted for 0', () => {
    expect(trendView(cmp(2, 1), 30).tone).toBe('good')
    expect(trendView(cmp(1, 2), 30).tone).toBe('bad')
    expect(trendView(cmp(2, 2), 30).tone).toBe('muted')
  })

  it('#122 AC8: a large decline in lines changed (-6270, -52%) is bad', () => {
    const v = trendView(cmp(5780, 12050), 30)
    expect(v.figure).toBe('−6,270 (−52%)')
    expect(v.tone).toBe('bad')
  })

  it('AC6: lines changed combines additions and deletions into total churn', () => {
    const total = combineComparisons(cmp(100, 50), cmp(40, 50))
    expect(total).toMatchObject({ current: 140, previous: 100, delta: 40 })
    expect(total.deltaPct).toBeCloseTo(40)
    const v = trendView(total, 30)
    expect(v).toMatchObject({ glyph: '↑', figure: '+40 (+40%)', tone: 'good' })
  })

  it('AC6: combined churn with zero previous has no percent', () => {
    expect(combineComparisons(cmp(5, 0), cmp(0, 0)).deltaPct).toBeUndefined()
  })

  it('#122 AC8: undefined comparison gives the quiet none state', () => {
    expect(trendView(undefined, 30)).toEqual({
      kind: 'none',
      glyph: '',
      figure: '',
      label: 'No comparison',
      srText: 'No comparison available for the previous period',
      tone: 'muted',
    })
  })

  it('AC8: previous zero (deltaPct undefined) gives none with no numbers', () => {
    const v = trendView(cmp(4, 0), 30)
    expect(v.kind).toBe('none')
    expect(v.glyph).toBe('')
    expect(v.figure).toBe('')
    expect(v.tone).toBe('muted')
  })

  it('AC4: neutral option keeps tone muted for increase, decrease and zero', () => {
    expect(trendView(cmp(200, 100), 30, { neutral: true }).tone).toBe('muted')
    expect(trendView(cmp(100, 200), 30, { neutral: true }).tone).toBe('muted')
    expect(trendView(cmp(100, 100), 30, { neutral: true }).tone).toBe('muted')
  })

  it('AC5: neutral keeps glyph and srText shape', () => {
    const up = trendView(cmp(112, 100), 30, { neutral: true })
    expect(up.glyph).toBe('↑')
    expect(up.srText).toBe('up 12 percent versus previous 30 days')
    const down = trendView(cmp(88, 100), 7, { neutral: true })
    expect(down.glyph).toBe('↓')
    expect(down.srText).toBe('down 12 percent versus previous 7 days')
    expect(trendView(cmp(5, 5), 30, { neutral: true }).srText).toBe('no change versus previous 30 days')
  })

  it('AC1: neutral rounds fractional delta and percent to whole numbers', () => {
    const v = trendView(cmp(112.6, 100.2), 30, { neutral: true })
    expect(v.figure).toBe('+12 (+12%)')
    expect(trendView(cmp(87.4, 100.2), 30, { neutral: true }).figure).toBe('−13 (−13%)')
    expect(trendView(cmp(100.3, 100), 30, { neutral: true }).figure).toBe('+0 (+<1%)')
  })

  it('AC1: neutral none state is unchanged', () => {
    expect(trendView(cmp(4, 0), 30, { neutral: true }).kind).toBe('none')
    expect(trendView(undefined, 30, { neutral: true }).label).toBe('No comparison')
  })

  it('AC11: screen-reader sentences', () => {
    expect(trendView(cmp(28, 25), 30).srText).toBe('up 12 percent versus previous 30 days')
    expect(trendView(cmp(22, 25), 30).srText).toBe('down 12 percent versus previous 30 days')
    expect(trendView(cmp(5, 5), 30).srText).toBe('no change versus previous 30 days')
    expect(trendView(cmp(1001, 1000), 7).srText).toBe('up less than 1 percent versus previous 7 days')
  })
})
