import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buckets } from '../../api/dashboard'
import type { Period } from '../../api/dashboard'
import type { MemberDetail as Detail, RecentPr } from '../../api/memberDetail'
import { DashboardContext } from '../DashboardProvider/context'
import type { DashboardValue } from '../DashboardProvider'
import MemberDetail from './MemberDetail'

const NOW = new Date('2026-06-15T12:00:00.000Z')

function pr(over: Partial<RecentPr> = {}): RecentPr {
  return {
    repo: 'acme/api',
    number: 1,
    state: 'merged',
    title: 'Fix the thing',
    additions: 10,
    deletions: 2,
    date: '2026-06-14T09:00:00.000Z',
    ...over,
  }
}

function detail(over: Partial<Detail> = {}, period: Period = 30): Detail {
  const mergedBuckets = buckets(period, NOW).map((b, i) => ({ ...b, count: i === 1 ? 3 : 0 }))
  return {
    login: 'Ana',
    merged: 3,
    reviewsGiven: 6,
    reviewsReceived: 2,
    medianFirstReviewMs: 5.5 * 60 * 60 * 1000,
    avgPrSize: 320,
    medianCycleMs: 3 * 24 * 60 * 60 * 1000,
    mergedBuckets,
    reviewOutcomes: { approved: 3, changesRequested: 2, commented: 1 },
    recentPrs: [pr(), pr({ number: 2, state: 'open', title: 'Add widget', date: '2026-05-01T09:00:00.000Z' })],
    recentTotal: 2,
    ...over,
  }
}

const EMPTY: Partial<Detail> = {
  mergedBuckets: buckets(30, NOW).map((b) => ({ ...b, count: 0 })),
  merged: 0,
  reviewsGiven: 0,
  reviewsReceived: 0,
  reviewOutcomes: { approved: 0, changesRequested: 0, commented: 0 },
  recentPrs: [],
  recentTotal: 0,
}

function renderDetail(over: Partial<DashboardValue> = {}, d: Detail | null = detail()) {
  const value = {
    status: 'ready',
    teamChosen: true,
    teamMembers: ['Ana', 'bob'],
    selection: 'all',
    period: 30,
    selectedMember: d ? d.login : null,
    memberDetail: () => d,
    ...over,
  } as unknown as DashboardValue
  return render(
    <DashboardContext.Provider value={value}>
      <MemberDetail now={() => NOW} />
    </DashboardContext.Provider>,
  )
}

describe('MemberDetail', () => {
  it('AC1: shows a hint and no panel when nothing is selected', () => {
    renderDetail({}, null)
    expect(screen.getByText('Select a member to see their detail.')).toBeInTheDocument()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('AC1: renders nothing while loading or for a member outside the team', () => {
    const { container } = renderDetail({ status: 'loading' })
    expect(container).toBeEmptyDOMElement()
    const other = renderDetail({ selectedMember: 'zed' }, detail({ login: 'zed' }))
    expect(other.container.querySelector('section')).toBeNull()
  })

  it('AC1: shows login, scope line and the three stat tiles', () => {
    renderDetail({ selection: 'acme/api', period: 30 })
    const panel = screen.getByRole('region', { name: 'Ana' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'Ana' })).toBeInTheDocument()
    expect(within(panel).getByText('acme/api · last 30 days')).toBeInTheDocument()
    const tile = (label: string) =>
      within(panel).getByText(label, { selector: 'span' }).previousElementSibling
    expect(tile('PRs merged')).toHaveTextContent('3')
    expect(tile('Reviews given')).toHaveTextContent('6')
    expect(tile('Reviews received')).toHaveTextContent('2')
  })

  it('AC3 (#21): shows time to first review, average PR size and cycle time with units', () => {
    renderDetail()
    const panel = screen.getByRole('region', { name: 'Ana' })
    const tile = (label: string) =>
      within(panel).getByText(label, { selector: 'span' }).previousElementSibling
    expect(tile('Median time to first review')).toHaveTextContent('5.5 h')
    expect(tile('Average PR size')).toHaveTextContent('320 lines')
    expect(tile('Median cycle time')).toHaveTextContent('3 days')
  })

  it('AC4 (#21): shows n/a when there are no qualifying pull requests', () => {
    renderDetail({}, detail({ ...EMPTY, medianFirstReviewMs: null, avgPrSize: null, medianCycleMs: null }))
    const panel = screen.getByRole('region', { name: 'Ana' })
    const tile = (label: string) =>
      within(panel).getByText(label, { selector: 'span' }).previousElementSibling
    expect(tile('Median time to first review')).toHaveTextContent('n/a')
    expect(tile('Average PR size')).toHaveTextContent('n/a')
    expect(tile('Median cycle time')).toHaveTextContent('n/a')
    expect(document.body).not.toHaveTextContent('NaN')
  })

  it('AC2: weeks for 30 and 90 days, days for 7, with the right headings', () => {
    const { unmount } = renderDetail({ period: 7 }, detail({}, 7))
    expect(screen.getByRole('heading', { level: 3, name: 'PRs merged per day' })).toBeInTheDocument()
    expect(screen.getByText('Last 7 days. Days with no merges count as 0.')).toBeInTheDocument()
    expect(screen.getAllByTestId('column')).toHaveLength(7)
    unmount()
    renderDetail({ period: 30 }, detail({}, 30))
    expect(screen.getByRole('heading', { level: 3, name: 'PRs merged per week' })).toBeInTheDocument()
    expect(screen.getByText('Last 30 days. Weeks with no merges count as 0.')).toBeInTheDocument()
  })

  it('AC2: zero buckets appear as 0 in the table; every 2nd label at 90 days', () => {
    renderDetail({ period: 90 }, detail({}, 90))
    const table = screen.getByRole('table', { name: 'PRs merged per week by Ana' })
    const values = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1].textContent)
    expect(values).toHaveLength(13)
    expect(values.filter((v) => v === '0')).toHaveLength(12)
    const labels = screen.getAllByTestId('x-label').map((l) => l.textContent)
    expect(labels.filter((l) => l !== '')).toHaveLength(7)
    expect(screen.getByRole('columnheader', { name: 'Week of' })).toBeInTheDocument()
  })

  it('AC6: the merged chart has a text alternative naming the busiest bucket', () => {
    renderDetail({ period: 30 })
    const caption = screen.getByRole('figure').querySelector('figcaption')!
    expect(caption.textContent).toMatch(/^3 pull requests merged over 5 weeks\. Busiest: .+, 3\.$/)
  })

  it('AC3: shows the three outcomes as labelled text with counts and variants', () => {
    renderDetail()
    const list = screen.getByRole('list', { name: 'Reviews given by outcome' })
    expect(within(list).getByText('Approved: 3 of 6 reviews.')).toBeInTheDocument()
    expect(within(list).getByText('Changes requested: 2 of 6 reviews.')).toBeInTheDocument()
    expect(within(list).getByText('Commented: 1 of 6 reviews.')).toBeInTheDocument()
    expect(within(list).getAllByTestId('bar-fill').map((f) => f.getAttribute('data-variant'))).toEqual([
      'solid',
      'muted',
      'hatched',
    ])
  })

  it('#68 AC5: outcomes with mixed digit counts share the BarList structure and proportional fills', () => {
    renderDetail(
      {},
      detail({ reviewOutcomes: { approved: 42, changesRequested: 5, commented: 0 }, reviewsGiven: 47 }),
    )
    const list = screen.getByRole('list', { name: 'Reviews given by outcome' })
    const rowsEls = within(list).getAllByRole('listitem')
    expect(rowsEls).toHaveLength(3)
    const classes = rowsEls.map((r) => r.className)
    expect(new Set(classes).size).toBe(1)
    const tracks = rowsEls.map((r) => r.children[2].className)
    expect(new Set(tracks).size).toBe(1)
    const counts = rowsEls.map((r) => r.children[3] as HTMLElement)
    expect(counts.map((c) => c.textContent)).toEqual(['42', '5', '0'])
    expect(new Set(counts.map((c) => c.className)).size).toBe(1)
    const widths = within(list)
      .getAllByTestId('bar-fill')
      .map((f) => parseFloat((f as HTMLElement).style.width))
    expect(widths[0]).toBeCloseTo(100)
    expect(widths[1]).toBeCloseTo((5 / 42) * 100)
    expect(widths[2]).toBe(0)
  })

  it('AC4: lists recent pull requests with state, repo, title, lines and when', () => {
    renderDetail()
    const list = screen.getByRole('list', { name: '' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // AC6: state is visible text outside any link
    expect(within(items[0]).getByText('Merged')).toBeInTheDocument()
    expect(within(items[1]).getByText('Open')).toBeInTheDocument()
    expect(within(items[0]).getByText('Fix the thing')).toHaveAttribute('title', 'Fix the thing')
    // AC5: repo, figure and date are plain visible content, read once through LinesDelta's own label
    const meta = items[0].querySelector('time')!.parentElement as HTMLElement
    expect(meta).toHaveTextContent(/acme\/api · \+10−2 ·/)
    expect(meta.querySelector('[role="img"]')).toHaveAttribute('aria-label', '10 added, 2 removed')
    expect(meta.closest('a')).toBeNull()
    // AC9: no sr-only sentence and nothing aria-hidden in any row; AC5: meta and state outside every link
    for (const [i, item] of items.entries()) {
      expect(item.querySelector('[aria-hidden="true"]')).toBeNull()
      expect(item).not.toHaveTextContent(/pull request #/)
      expect(item).not.toHaveTextContent(`#${i + 1}`)
      const link = within(item).getByRole('link')
      const metaEl = item.querySelector('time')!.parentElement as HTMLElement
      expect(link.contains(metaEl)).toBe(false)
      expect(metaEl.closest('a')).toBeNull()
      expect(link.contains(within(item).getByText(i === 0 ? 'Merged' : 'Open'))).toBe(false)
      expect(link.querySelector('time, [role="img"]')).toBeNull()
    }
    expect(within(items[0]).getAllByText('Fix the thing')).toHaveLength(1)
    const time = items[1].querySelector('time')!
    expect(time).toHaveAttribute('datetime', '2026-05-01T09:00:00.000Z')
    expect(time.textContent).toBe('May 1')
    expect(time.getAttribute('title')).toBeTruthy()
    expect(screen.queryByText(/most recent of/)).toBeNull()
  })

  describe('#91: PR title links', () => {
    const MIXED = [
      pr({ repo: 'acme/api', number: 11, title: 'Fix login bug' }),
      pr({ repo: 'other-org/web.app', number: 5, state: 'open', title: 'Add widget' }),
      pr({ repo: 'acme/docs', number: 230, state: 'closed', title: 'Update guide' }),
      pr({ repo: 'not a repo', number: 7, title: 'Broken repo row' }),
    ]

    function rows() {
      renderDetail({}, detail({ recentPrs: MIXED, recentTotal: MIXED.length }))
      return within(screen.getByRole('list', { name: '' })).getAllByRole('listitem')
    }

    it('AC1, AC2, AC3: each valid row links to its own repo and number, in a new tab', () => {
      const items = rows()
      const hrefs = items.slice(0, 3).map((li) => within(li).getByRole('link').getAttribute('href'))
      expect(hrefs).toEqual([
        'https://github.com/acme/api/pull/11',
        'https://github.com/other-org/web.app/pull/5',
        'https://github.com/acme/docs/pull/230',
      ])
      for (const li of items.slice(0, 3)) {
        const link = within(li).getByRole('link')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      }
    })

    it('AC1, AC5: the link name is the title plus the new-tab hint, without figure, repo or date', () => {
      const items = rows()
      expect(within(items[0]).getByRole('link', { name: 'Fix login bug (opens in a new tab)' })).toBeInTheDocument()
      for (const li of items.slice(0, 3)) {
        const link = within(li).getByRole('link')
        expect(link.textContent).not.toMatch(/acme|other-org|added|removed|[+−]\d/)
        expect(link.querySelector('time')).toBeNull()
      }
    })

    it('AC4: an invalid repo keeps the title as plain text and the rest of the row', () => {
      const li = rows()[3]
      expect(within(li).queryByRole('link')).toBeNull()
      expect(within(li).getByText('Broken repo row')).toHaveAttribute('title', 'Broken repo row')
      expect(within(li).getByText('Merged')).toBeInTheDocument()
      expect(li).toHaveTextContent('not a repo')
      expect(li.querySelector('[role="img"]')).toHaveAttribute('aria-label', '10 added, 2 removed')
      expect(li.querySelector('time')).not.toBeNull()
    })

    it('AC9: no nested interactive elements and each title is read once', () => {
      const items = rows()
      for (const li of items) {
        for (const link of li.querySelectorAll('a')) {
          expect(link.querySelector('a, button, input, select, textarea, [tabindex], [role]')).toBeNull()
        }
        expect(li.querySelector('[aria-hidden="true"]')).toBeNull()
      }
      expect(screen.getAllByText('Fix login bug')).toHaveLength(1)
    })

    it('AC7: one focus stop per valid link and no tabindex', () => {
      rows()
      const list = screen.getByRole('list', { name: '' })
      expect(within(list).getAllByRole('link')).toHaveLength(3)
      expect(list.querySelectorAll('[tabindex]')).toHaveLength(0)
      expect(list.querySelectorAll('button, input, select, textarea')).toHaveLength(0)
    })

    it('AC10: rendering the links makes no request', () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      rows()
      expect(fetchSpy).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('AC11: reuses the shared PrLink and prUrl instead of copying them', () => {
      const source = readFileSync(join(__dirname, 'MemberDetail.tsx'), 'utf8')
      expect(source).toMatch(/import PrLink from '\.\.\/PrLink'/)
      expect(source).not.toMatch(/github\.com\/\$\{[^}]*\}\/pull/)
      expect(source).not.toContain('pull/')
    })
  })

  it('AC4: notes the limit when there are more than 10', () => {
    renderDetail({}, detail({ recentTotal: 14 }))
    expect(screen.getByText('Showing the 2 most recent of 14.')).toBeInTheDocument()
  })

  it('AC5: the profile link opens GitHub in a new tab', () => {
    renderDetail()
    const link = screen.getByRole('link', {
      name: 'Open profile of Ana on GitHub (opens in a new tab)',
    })
    expect(link).toHaveAttribute('href', 'https://github.com/Ana')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('Open profile on GitHub')
  })

  it('AC6: a member with no activity shows an empty state per section and zero tiles', () => {
    renderDetail({}, detail(EMPTY))
    expect(screen.getByText('No pull requests merged by Ana in this period.')).toBeInTheDocument()
    expect(screen.getByText('Ana has not given any reviews in this period.')).toBeInTheDocument()
    expect(screen.getByText('Ana has no pull requests in this period.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.getByText('PRs merged', { selector: 'span' }).previousElementSibling).toHaveTextContent('0')
  })

  it('AC6: partial activity only empties the section without data', () => {
    renderDetail({}, detail({ reviewOutcomes: { approved: 0, changesRequested: 0, commented: 0 } }))
    expect(screen.getByText('Ana has not given any reviews in this period.')).toBeInTheDocument()
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(screen.queryByText('Ana has no pull requests in this period.')).toBeNull()
  })

  it('AC7: rendering makes no network request and does not take focus', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderDetail()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
    vi.unstubAllGlobals()
  })

  it('scrolls the panel into view only when it starts below the fold', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    rect.mockReturnValue({ top: 10 } as DOMRect)
    const first = renderDetail()
    expect(scroll).not.toHaveBeenCalled()
    first.unmount()
    rect.mockReturnValue({ top: window.innerHeight + 50 } as DOMRect)
    renderDetail()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    rect.mockRestore()
    // @ts-expect-error restore jsdom's lack of scrollIntoView
    delete Element.prototype.scrollIntoView
  })
})
