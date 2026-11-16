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

  it('AC4: lists recent pull requests with state, repo, title, lines and when', () => {
    renderDetail()
    const list = screen.getByRole('list', { name: '' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(
      'Merged pull request #1 in acme/api: Fix the thing. 10 lines added, 2 removed, 1 day ago.',
    )
    expect(within(items[0]).getByText('Fix the thing', { selector: 'span[title]' })).toHaveAttribute(
      'title',
      'Fix the thing',
    )
    expect(within(items[0]).getByText(/acme\/api · \+10 −2/)).toBeInTheDocument()
    const time = items[1].querySelector('time')!
    expect(time).toHaveAttribute('datetime', '2026-05-01T09:00:00.000Z')
    expect(time.textContent).toBe('May 1')
    expect(time.getAttribute('title')).toBeTruthy()
    expect(within(items[1]).getByText('Open', { selector: 'span:not(.srOnly)' })).toBeInTheDocument()
    expect(screen.queryByText(/most recent of/)).toBeNull()
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
