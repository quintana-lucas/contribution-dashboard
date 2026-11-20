import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mockElementRect } from '../../test/chart'
import { CHART_MIN_MARK } from '../ChartFrame'
import ReviewsChart from './ReviewsChart'
import css from './ReviewsChart.module.css?inline'

const rows = [
  { login: 'ada', approved: 5, changesRequested: 2, commented: 3, total: 10 },
  { login: 'bob', approved: 1, changesRequested: 0, commented: 1, total: 2 },
]

describe('ReviewsChart', () => {
  it('AC2: shows name, total and counts as text per row, chart view by default', () => {
    render(<ReviewsChart rows={rows} />)
    const list = screen.getByRole('list', { name: 'Reviews given per person' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(
      'ada: 10 reviews: 5 approved, 2 changes requested, 3 commented',
    )
    expect(items[1]).toHaveTextContent('bob: 2 reviews: 1 approved, 0 changes requested, 1 commented')
    expect(screen.getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('AC2: toggles to a real table with caption and columns', () => {
    render(<ReviewsChart rows={rows} />)
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('list', { name: 'Reviews given per person' })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: /reviews given per person/i })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Person', 'Approved', 'Changes requested', 'Commented', 'Total'])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(2)
    expect(within(body[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '5',
      '2',
      '3',
      '10',
    ])
    expect(within(body[0]).getByRole('rowheader')).toHaveTextContent('ada')
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('AC3: legend labels outcomes by text', () => {
    render(<ReviewsChart rows={rows} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('Approved')
    expect(legend).toHaveTextContent('Changes requested')
    expect(legend).toHaveTextContent('Commented')
  })

  it('AC3: has no region role', () => {
    render(<ReviewsChart rows={rows} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  const rects = (li: Element) => Array.from(li.querySelectorAll('svg rect'))
  const stackWidth = (li: Element) =>
    rects(li).reduce((sum, r) => sum + Number(r.getAttribute('width')), 0)

  it('#105 AC1: stacked bar in order Approved, Changes requested, Commented with token fills', () => {
    const { container } = render(<ReviewsChart rows={rows} />)
    const [ada] = Array.from(container.querySelectorAll('ol > li'))
    const segs = rects(ada)
    expect(segs.map((s) => s.getAttribute('data-outcome'))).toEqual([
      'approved',
      'changesRequested',
      'commented',
    ])
    expect(segs.map((s) => s.getAttribute('fill'))).toEqual([
      'var(--color-good)',
      'var(--color-caution)',
      'var(--color-bar-muted)',
    ])
    const xs = segs.map((s) => Number(s.getAttribute('x')))
    expect(xs[0]).toBe(0)
    expect(xs[1]).toBeGreaterThan(Number(segs[0].getAttribute('width')))
    expect(xs[2]).toBeGreaterThan(xs[1])
    expect(ada.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('#105 AC1: no stripe or dot fills and a 1px gap between segments', () => {
    const { container } = render(<ReviewsChart rows={rows} />)
    expect(container.querySelector('pattern, linearGradient')).toBeNull()
    for (const r of container.querySelectorAll('rect')) {
      expect(r.getAttribute('fill')).toMatch(/^var\(--color-(good|caution|bar-muted)\)$/)
    }
    expect(css).not.toMatch(/repeating-linear-gradient|radial-gradient/)
    const [ada] = Array.from(container.querySelectorAll('ol > li'))
    const segs = rects(ada).map((s) => ({
      x: Number(s.getAttribute('x')),
      w: Number(s.getAttribute('width')),
    }))
    expect(segs[1].x - (segs[0].x + segs[0].w)).toBeCloseTo(1)
    expect(segs[2].x - (segs[1].x + segs[1].w)).toBeCloseTo(1)
  })

  describe('with a measured track', () => {
    const TRACK = 200
    let restore: () => void
    beforeEach(() => {
      restore = mockElementRect({ width: TRACK })
    })
    afterEach(() => restore())

    const extent = (li: Element) =>
      Math.max(...rects(li).map((s) => Number(s.getAttribute('x')) + Number(s.getAttribute('width'))))

    it('#105 AC2: a small non-zero count is at least the min mark in px and a zero draws nothing', () => {
      const { container } = render(
        <ReviewsChart
          rows={[
            { login: 'big', approved: 1000, changesRequested: 0, commented: 0, total: 1000 },
            { login: 'tiny', approved: 1, changesRequested: 0, commented: 1000, total: 1001 },
          ]}
        />,
      )
      const [big, tiny] = Array.from(container.querySelectorAll('ol > li'))
      expect(rects(big)).toHaveLength(1)
      expect(tiny.querySelector('svg')).toHaveAttribute('viewBox', `0 0 ${TRACK} 20`)
      const approved = tiny.querySelector('rect[data-outcome="approved"]')!
      expect(Number(approved.getAttribute('width'))).toBeGreaterThanOrEqual(CHART_MIN_MARK)
      expect(tiny.querySelector('rect[data-outcome="changesRequested"]')).toBeNull()
    })

    it('#105 AC2: the max-total row with tiny segments fits the track and shows every non-zero segment', () => {
      const { container } = render(
        <ReviewsChart
          rows={[{ login: 'max', approved: 997, changesRequested: 1, commented: 2, total: 1000 }]}
        />,
      )
      const [li] = Array.from(container.querySelectorAll('ol > li'))
      const segs = rects(li)
      expect(segs).toHaveLength(3)
      for (const s of segs) {
        expect(Number(s.getAttribute('width'))).toBeGreaterThanOrEqual(CHART_MIN_MARK)
      }
      expect(extent(li)).toBeLessThanOrEqual(TRACK + 1e-9)
    })
  })

  it('#105 AC2: each row shows its total on the right', () => {
    const { container } = render(<ReviewsChart rows={rows} />)
    const items = container.querySelectorAll('ol > li')
    expect(items[0].lastElementChild).toHaveTextContent('10')
    expect(items[1].lastElementChild).toHaveTextContent('2')
  })

  it('#105 AC3: toggle sits alone in its row, right-aligned, and the legend is below the chart', () => {
    const { container } = render(<ReviewsChart rows={rows} />)
    const toolbar = screen.getByRole('button', { name: 'Chart' }).closest('div')!.parentElement!
    expect(toolbar.children).toHaveLength(1)
    expect(within(toolbar).queryByRole('list')).not.toBeInTheDocument()
    expect(css).toMatch(/\._toolbar_\w+\s*\{[^}]*justify-content:\s*flex-end/)
    const list = screen.getByRole('list', { name: 'Reviews given per person' })
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(list.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.contains(legend)).toBe(true)
  })

  it('#105 AC3: legend wraps without truncating; bars >= 20px and rows >= 28px', () => {
    expect(css).toMatch(/\._legend_\w+\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\._legendItem_\w+\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\._track_\w+\s*\{[^}]*height:\s*20px/)
    expect(css).toMatch(/\._row_\w+\s*\{[^}]*min-height:\s*28px/)
    expect(css).toMatch(/\._row_\w+:focus-visible\s*\{[^}]*var\(--color-focus\)/)
  })

  it('#105 AC4: hover opens the tooltip with login, counts and total', async () => {
    render(<ReviewsChart rows={rows} />)
    const [ada] = within(screen.getByRole('list', { name: 'Reviews given per person' })).getAllByRole('listitem')
    fireEvent.mouseEnter(ada)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('ada')
    expect(tip).toHaveTextContent('Approved5')
    expect(tip).toHaveTextContent('Changes requested2')
    expect(tip).toHaveTextContent('Commented3')
    expect(tip).toHaveTextContent('Total: 10 reviews')
    fireEvent.mouseLeave(ada)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#105 AC4: rows are focusable; focus opens the tooltip and Escape closes it', () => {
    render(<ReviewsChart rows={rows} />)
    const [, bob] = within(screen.getByRole('list', { name: 'Reviews given per person' })).getAllByRole('listitem')
    expect(bob).toHaveAttribute('tabindex', '0')
    fireEvent.focus(bob)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 2 reviews')
    fireEvent.keyDown(bob, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#72 AC1: rows with different digit counts share the same structure', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'a', approved: 5, changesRequested: 0, commented: 0, total: 5 },
          { login: 'b', approved: 12, changesRequested: 0, commented: 0, total: 12 },
        ]}
      />,
    )
    const items = Array.from(container.querySelectorAll('ol > li'))
    expect(items).toHaveLength(2)
    const shape = (li: Element) => Array.from(li.children).map((c) => c.className)
    expect(items[0].className).toBe(items[1].className)
    expect(shape(items[0])).toEqual(shape(items[1]))
    expect(items[0].children).toHaveLength(4)
  })

  it('#72 AC2: CSS gives the count column a fixed width, right-aligned, tabular', () => {
    const cols = /grid-template-columns:\s*([^;]+);/.exec(css)?.[1] ?? ''
    expect(cols).toMatch(/\s\d+ch\s*$/)
    expect(cols).not.toMatch(/auto/)
    expect(css).toMatch(/tabular-nums;\s*text-align:\s*right/)
  })

  it('#72 AC3: each stack width is proportional to total / max', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'a', approved: 5, changesRequested: 0, commented: 0, total: 5 },
          { login: 'b', approved: 12, changesRequested: 0, commented: 0, total: 12 },
        ]}
      />,
    )
    const [a, b] = Array.from(container.querySelectorAll('ol > li'))
    expect(stackWidth(a)).toBeCloseTo((5 / 12) * 100)
    expect(stackWidth(b)).toBeCloseTo(100)
  })

  it('#72 AC4: a zero total shows "0" and an empty 0% stack', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'z', approved: 0, changesRequested: 0, commented: 0, total: 0 },
          { login: 'y', approved: 3, changesRequested: 0, commented: 0, total: 3 },
        ]}
      />,
    )
    const items = container.querySelectorAll('ol > li')
    expect(items[0].children[3]).toHaveTextContent('0')
    expect(rects(items[0])).toHaveLength(0)
    expect(stackWidth(items[0])).toBe(0)
  })

  it('#72 AC4: empty rows render an empty list without crashing', () => {
    render(<ReviewsChart rows={[]} />)
    const list = screen.getByRole('list', { name: 'Reviews given per person' })
    expect(list).toBeEmptyDOMElement()
  })
})
