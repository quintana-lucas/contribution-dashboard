import { describe, expect, it } from 'vitest'
import type { MetricComparison } from './kpiComparison.ts'
import {
  GOOD_DIRECTION,
  combineComparisons,
  metricOf,
  toneFor,
  trendView,
  type TrendMetric,
} from './trendView.ts'

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

const METRICS = Object.keys(GOOD_DIRECTION) as TrendMetric[]

describe('toneFor / GOOD_DIRECTION', () => {
  it('AC2: the good-direction map is the single source of truth for the four metrics', () => {
    expect(GOOD_DIRECTION).toEqual({
      mergedPrs: 'up',
      reviews: 'up',
      linesChanged: 'up',
      avgPrSize: 'down',
    })
  })

  it.each(METRICS)('AC2, AC5: toneFor(%s) follows the good direction, exhaustively', (metric) => {
    const goodUp = GOOD_DIRECTION[metric] === 'up'
    expect(toneFor(metric, 5)).toBe(goodUp ? 'good' : 'bad')
    expect(toneFor(metric, -5)).toBe(goodUp ? 'bad' : 'good')
    expect(toneFor(metric, 0)).toBe('muted')
  })

  it.each(METRICS)('AC5: trendView(%s) tone for up, down and zero comes from toneFor', (metric) => {
    expect(trendView(metric, cmp(2, 1), 30).tone).toBe(toneFor(metric, 1))
    expect(trendView(metric, cmp(1, 2), 30).tone).toBe(toneFor(metric, -1))
    expect(trendView(metric, cmp(2, 2), 30).tone).toBe('muted')
  })

  it('AC5: Average PR size smaller is good, larger is bad', () => {
    expect(trendView('avgPrSize', cmp(80, 100), 30).tone).toBe('good')
    expect(trendView('avgPrSize', cmp(120, 100), 30).tone).toBe('bad')
  })

  it.each(METRICS)('AC4: %s no comparison and previous 0 are muted', (metric) => {
    expect(trendView(metric, undefined, 30).tone).toBe('muted')
    expect(trendView(metric, cmp(4, 0), 30).tone).toBe('muted')
  })
})

describe('trendView', () => {
  it('AC1: up shows glyph, signed delta and percent', () => {
    const v = trendView('mergedPrs', cmp(28, 25), 30)
    expect(v).toMatchObject({ kind: 'trend', glyph: '↑', figure: '+3 (+12%)' })
  })

  it('AC1: down uses U+2212 minus and en-US numbers', () => {
    const v = trendView('mergedPrs', cmp(8800, 10000), 30)
    expect(v.glyph).toBe('↓')
    expect(v.figure).toBe('−1,200 (−12%)')
  })

  it('AC1: a tiny non-zero change shows "<1%" with its sign', () => {
    expect(trendView('mergedPrs', cmp(1001, 1000), 30).figure).toBe('+1 (+<1%)')
    expect(trendView('mergedPrs', cmp(999, 1000), 30).figure).toBe('−1 (−<1%)')
  })

  it('AC1: zero change renders "→ 0 (0%)" in muted', () => {
    expect(trendView('mergedPrs', cmp(5, 5), 30)).toMatchObject({
      glyph: '→',
      figure: '0 (0%)',
      tone: 'muted',
    })
  })

  it('AC2: label names the period', () => {
    expect(trendView('mergedPrs', cmp(2, 1), 7).label).toBe('vs previous 7 days')
    expect(trendView('mergedPrs', cmp(2, 1), 90).label).toBe('vs previous 90 days')
  })

  it('#122 AC8: a large decline in lines changed (-6270, -52%) is bad', () => {
    const v = trendView('linesChanged', cmp(5780, 12050), 30)
    expect(v.figure).toBe('−6,270 (−52%)')
    expect(v.tone).toBe('bad')
  })

  it('AC6: lines changed combines additions and deletions into total churn', () => {
    const total = combineComparisons(cmp(100, 50), cmp(40, 50))
    expect(total).toMatchObject({ current: 140, previous: 100, delta: 40 })
    expect(total.deltaPct).toBeCloseTo(40)
    const v = trendView('linesChanged', total, 30)
    expect(v).toMatchObject({ glyph: '↑', figure: '+40 (+40%)', tone: 'good' })
  })

  it('AC6: combined churn with zero previous has no percent', () => {
    expect(combineComparisons(cmp(5, 0), cmp(0, 0)).deltaPct).toBeUndefined()
  })

  it('#122 AC8: undefined comparison gives the quiet none state', () => {
    expect(trendView('mergedPrs', undefined, 30)).toEqual({
      kind: 'none',
      glyph: '',
      figure: '',
      label: 'No comparison',
      srText: 'No comparison available for the previous period',
      tone: 'muted',
    })
  })

  it('AC8: previous zero (deltaPct undefined) gives none with no numbers', () => {
    const v = trendView('mergedPrs', cmp(4, 0), 30)
    expect(v.kind).toBe('none')
    expect(v.glyph).toBe('')
    expect(v.figure).toBe('')
    expect(v.tone).toBe('muted')
  })

  it('AC4: round does not change the tone, which still comes from toneFor', () => {
    expect(trendView('avgPrSize', cmp(100, 200), 30, { round: true }).tone).toBe('good')
    expect(trendView('avgPrSize', cmp(200, 100), 30, { round: true }).tone).toBe('bad')
    expect(trendView('avgPrSize', cmp(100, 100), 30, { round: true }).tone).toBe('muted')
  })

  it('AC5: round keeps glyph and srText shape', () => {
    const up = trendView('avgPrSize', cmp(112, 100), 30, { round: true })
    expect(up.glyph).toBe('↑')
    expect(up.srText).toBe('up 12 percent versus previous 30 days')
    const down = trendView('avgPrSize', cmp(88, 100), 7, { round: true })
    expect(down.glyph).toBe('↓')
    expect(down.srText).toBe('down 12 percent versus previous 7 days')
    expect(trendView('avgPrSize', cmp(5, 5), 30, { round: true }).srText).toBe(
      'no change versus previous 30 days',
    )
  })

  it('AC1: round rounds fractional delta and percent to whole numbers', () => {
    const v = trendView('avgPrSize', cmp(112.6, 100.2), 30, { round: true })
    expect(v.figure).toBe('+12 (+12%)')
    expect(trendView('avgPrSize', cmp(87.4, 100.2), 30, { round: true }).figure).toBe('−13 (−13%)')
    expect(trendView('avgPrSize', cmp(100.3, 100), 30, { round: true }).figure).toBe('+0 (+<1%)')
  })

  it('AC1: round none state is unchanged', () => {
    expect(trendView('avgPrSize', cmp(4, 0), 30, { round: true }).kind).toBe('none')
    expect(trendView('avgPrSize', undefined, 30, { round: true }).label).toBe('No comparison')
  })

  it('AC11: screen-reader sentences', () => {
    expect(trendView('mergedPrs', cmp(28, 25), 30).srText).toBe('up 12 percent versus previous 30 days')
    expect(trendView('mergedPrs', cmp(22, 25), 30).srText).toBe('down 12 percent versus previous 30 days')
    expect(trendView('mergedPrs', cmp(5, 5), 30).srText).toBe('no change versus previous 30 days')
    expect(trendView('mergedPrs', cmp(1001, 1000), 7).srText).toBe(
      'up less than 1 percent versus previous 7 days',
    )
  })
})
