import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OVERDUE_HOURS } from '../../api/waiting'
import type { StoredRepo } from '../../api/types'
import { makeDeps, storedRepo } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import WaitingWidget from './WaitingWidget'

// NOW is 2026-06-15T12:00Z. acme/api: PR1 by ana (3 days old, overdue, reviewer bob), PR2 by bob (2h old),
// PR3 by ana (reviewed). acme/web: PR1 by cy (30h old, team reviewer), PR2 by a bot.
function makeWaitingDeps() {
  const deps = makeDeps()
  const api = storedRepo('acme/api', '2026-06-15T09:00:00.000Z', ['ana', 'bob', 'ana'])
  api.pullRequests[0].createdAt = '2026-06-12T12:00:00.000Z'
  api.pullRequests[0].additions = 40
  api.pullRequests[0].deletions = 7
  api.pullRequests[0].requestedReviewers = [{ kind: 'user', login: 'dee', isBot: false }]
  api.pullRequests[1].createdAt = '2026-06-15T10:00:00.000Z'
  api.reviews = [
    {
      id: 'a1',
      pullRequestNumber: 3,
      reviewer: 'bob',
      reviewerIsBot: false,
      outcome: 'approved',
      submittedAt: '2026-06-15T11:00:00.000Z',
    },
  ]
  const web = storedRepo('acme/web', '2026-06-15T11:30:00.000Z', ['cy', 'dependabot'])
  web.pullRequests[0].createdAt = '2026-06-14T06:00:00.000Z'
  web.pullRequests[0].requestedReviewers = [{ kind: 'team', slug: 'core' }]
  web.pullRequests[1].authorIsBot = true
  const data: Record<string, StoredRepo> = { 'acme/api': api, 'acme/web': web }
  deps.getRepoData = vi.fn(async (repo: string) => ({ ok: true as const, data: data[repo] }))
  return deps
}

async function renderWidget(deps = makeWaitingDeps(), onOpenSettings = vi.fn()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <WaitingWidget onOpenSettings={onOpenSettings} />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return { deps, onOpenSettings }
}

function items() {
  return within(screen.getByRole('list', { name: 'Pull requests waiting for review' })).getAllByRole('listitem')
}

describe('WaitingWidget', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('AC1: lists unreviewed open PRs with title, number, repo, author, lines, reviewers and age', async () => {
    await renderWidget()
    const rows = items()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Fake PR 1 (opens in a new tab) #1')
    expect(rows[0]).toHaveTextContent('acme/api')
    expect(rows[0]).toHaveTextContent('by ana')
    expect(rows[0]).toHaveTextContent('+40 / -7')
    expect(rows[0]).toHaveTextContent('Reviewers: dee')
    expect(rows[0]).toHaveTextContent('Waiting 3d')
    expect(rows[1]).toHaveTextContent('Reviewers: core')
    expect(rows[1]).toHaveTextContent('Waiting 1d 6h')
    expect(rows[2]).toHaveTextContent('Reviewers: none requested')
    expect(rows[2]).toHaveTextContent('Waiting 2h')
  })

  it('AC2: marks PRs waiting more than 24 hours as Overdue with text', async () => {
    await renderWidget()
    const rows = items()
    expect(rows[0]).toHaveTextContent('Overdue')
    expect(rows[1]).toHaveTextContent('Overdue')
    expect(rows[2]).not.toHaveTextContent('Overdue')
  })

  it('AC3: choosing a repo lists only its PRs; bots are excluded', async () => {
    await renderWidget()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    const rows = items()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('acme/web')
    expect(
      screen.getByRole('region', { name: 'Open PRs waiting for review' }),
    ).not.toHaveTextContent('dependabot')
  })

  it('AC3: authors outside the selected team are excluded', async () => {
    const deps = makeWaitingDeps()
    deps.getTeam = vi.fn(async () => ({
      ok: true as const,
      candidates: [],
      selected: ['bob'],
      added: [],
    }))
    await renderWidget(deps)
    const rows = items()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('by bob')
  })

  it('AC4: shows the empty message when nothing is waiting', async () => {
    const deps = makeWaitingDeps()
    deps.getRepoData = vi.fn(async (repo: string) => ({
      ok: true as const,
      data: { ...storedRepo(repo, '2026-06-15T09:00:00.000Z', []) },
    }))
    await renderWidget(deps)
    expect(screen.getByText('Nothing is waiting for review in this repository.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('#88 AC7: the hint states the scope and the overdue rule instead of repeating the heading', async () => {
    await renderWidget()
    const region = screen.getByRole('region', { name: 'Open PRs waiting for review' })
    expect(region).toHaveTextContent('All repositories · overdue after')
    expect(region).not.toHaveTextContent('Pull requests waiting for review ·')
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(region).toHaveTextContent('acme/web · overdue after')
  })

  it('#88 AC7: the hours in the hint come from OVERDUE_HOURS', async () => {
    await renderWidget()
    expect(screen.getByRole('region', { name: 'Open PRs waiting for review' })).toHaveTextContent(
      `overdue after ${OVERDUE_HOURS} h`,
    )
  })

  it('#88 AC10: a space separates the age from the Overdue chip; non-overdue rows have no chip', async () => {
    await renderWidget()
    const rows = items()
    expect(rows[0].textContent).toContain('Waiting 3d Overdue')
    expect(rows[2].textContent).not.toContain('Overdue')
    expect(within(rows[2]).queryByText('Overdue')).toBeNull()
    expect(within(rows[0]).getByText('Overdue')).toBeInTheDocument()
  })

  it('#88 AC2: the PR number is its own element, separate from the title text', async () => {
    await renderWidget()
    const row = items()[0]
    const number = within(row).getByText('#1')
    const title = within(row).getByText('Fake PR 1')
    expect(number).not.toBe(title)
    expect(title.textContent).toBe('Fake PR 1')
    expect(number.textContent).toBe('#1')
  })

  it('#88 AC3: the Waiting label and the age value are separate elements in one wrapper, in order', async () => {
    await renderWidget()
    const row = items()[0]
    const label = within(row).getByText('Waiting')
    const value = within(row).getByText('3d')
    expect(label).not.toBe(value)
    expect(label.parentElement).toBe(value.parentElement)
    expect(label.nextElementSibling).toBe(value)
    expect(value.textContent).toBe('3d')
  })

  it('#88 AC5: identity and time/people sit on two separate meta lines', async () => {
    await renderWidget()
    const row = items()[0]
    const lines = row.querySelectorAll('p')
    expect(lines).toHaveLength(3)
    const identity = lines[1]
    const people = lines[2]
    expect(identity).toHaveTextContent('acme/api')
    expect(identity).toHaveTextContent('by ana')
    expect(identity).not.toHaveTextContent('Reviewers')
    expect(people).toHaveTextContent('Reviewers: dee')
    expect(people).toHaveTextContent('Waiting 3d')
  })

  it('#88 AC6: the +/- figure is in its own single element, last on the identity line', async () => {
    await renderWidget()
    const row = items()[0]
    const figure = within(row).getByText('+40 / -7')
    expect(figure.children).toHaveLength(0)
    expect(figure.parentElement?.lastElementChild).toBe(figure)
  })

  it('#84 AC1 AC5: the overdue chip has the warning icon before the word Overdue; the icon adds no text', async () => {
    await renderWidget()
    const chip = within(items()[0]).getByText('Overdue')
    expect(chip.className).toMatch(/overdue/)
    const icon = chip.querySelector('svg[data-icon="warning"]')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(chip.firstElementChild).toBe(icon)
    expect(chip.textContent).toBe('Overdue')
  })

  it('#84 AC1: non-overdue rows have no chip and no warning icon', async () => {
    await renderWidget()
    const row = items()[2]
    expect(row.querySelector('svg')).toBeNull()
    expect(row.querySelector('[class*="overdue"]')).toBeNull()
  })

  it('#84 AC2: overdue rows color the whole age (label and value) with the caution modifier; others stay neutral', async () => {
    await renderWidget()
    const rows = items()
    for (const row of [rows[0], rows[1]]) {
      expect(within(row).getByText('Waiting').className).toMatch(/Overdue/)
    }
    expect(within(rows[0]).getByText('3d').className).toMatch(/Overdue/)
    expect(within(rows[2]).getByText('Waiting').className).not.toMatch(/Overdue/)
    expect(within(rows[2]).getByText('2h').className).not.toMatch(/Overdue/)
  })

  it('AC5: is a region with an accessible name Open PRs waiting for review', async () => {
    await renderWidget()
    expect(screen.getByRole('region', { name: 'Open PRs waiting for review' })).toBeInTheDocument()
  })

  it('AC1: not synced state points to settings', async () => {
    const deps = makeWaitingDeps()
    deps.listRepos = vi.fn(async () => ({
      ok: true as const,
      repos: [{ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null }],
    }))
    const { onOpenSettings } = await renderWidget(deps)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('#90 AC1 AC2: each row has one link to its PR on GitHub, named by title plus the new-tab hint', async () => {
    await renderWidget()
    const rows = items()
    const hrefs = rows.map((row) => within(row).getByRole('link').getAttribute('href'))
    expect(hrefs).toEqual([
      'https://github.com/acme/api/pull/1',
      'https://github.com/acme/web/pull/1',
      'https://github.com/acme/api/pull/2',
    ])
    expect(within(rows[0]).getByRole('link', { name: 'Fake PR 1 (opens in a new tab)' })).toBeInTheDocument()
    expect(within(rows[0]).getByText('#1').closest('a')).toBeNull()
    expect(within(rows[0]).getAllByRole('link')).toHaveLength(1)
  })

  it('#90 AC5: tab order has exactly one stop per row', async () => {
    await renderWidget()
    const links = within(screen.getByRole('list', { name: 'Pull requests waiting for review' })).getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('tabindex')).toBeNull()
    }
  })

  it('#90 AC4: a row with an invalid repo name shows the title as plain text and keeps its other content', async () => {
    const deps = makeWaitingDeps()
    deps.listRepos = vi.fn(async () => ({
      ok: true as const,
      repos: [{ repo: 'bad repo', syncedAt: '2026-06-15T09:00:00.000Z', baseBranch: 'main', people: 1 }],
    }))
    deps.getRepoData = vi.fn(async (repo: string) => ({
      ok: true as const,
      data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']),
    }))
    await renderWidget(deps)
    const rows = items()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).queryByRole('link')).toBeNull()
    expect(rows[0]).toHaveTextContent('Fake PR 1 #1')
    expect(rows[0]).not.toHaveTextContent('opens in a new tab')
    expect(rows[0]).toHaveTextContent('bad repo')
    expect(rows[0]).toHaveTextContent('by ana')
  })

  it('#90 AC8 AC11: rendering the links makes no network requests', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await renderWidget()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC6: rendering and changing the repo make no network requests', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    await renderWidget()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
  })
})
