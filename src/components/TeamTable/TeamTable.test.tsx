import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TeamStatsRow } from '../../api/teamStats'
import { DashboardContext } from '../DashboardProvider/context'
import type { DashboardValue } from '../DashboardProvider'
import TeamTable from './TeamTable'

function row(login: string, over: Partial<TeamStatsRow> = {}): TeamStatsRow {
  return {
    login,
    opened: 0,
    merged: 0,
    closed: 0,
    open: 0,
    reviewsGiven: 0,
    reviewsReceived: 0,
    additions: 0,
    deletions: 0,
    avgPrSize: null,
    medianFirstReviewMs: null,
    medianCycleMs: null,
    ...over,
  }
}

const HOUR = 60 * 60 * 1000

const ROWS = [
  row('Ana', {
    opened: 5, merged: 3, closed: 1, open: 1, reviewsGiven: 4, reviewsReceived: 2, additions: 120, deletions: 45,
    avgPrSize: 300, medianFirstReviewMs: 5.5 * HOUR,
  }),
  row('bob', { opened: 2, merged: 5, additions: 10, deletions: 10, avgPrSize: 20, medianFirstReviewMs: 30 * 60 * 1000 }),
  row('cy'),
]

function renderTable(over: Partial<DashboardValue> = {}, onChooseTeam = vi.fn()) {
  const setSelectedMember = vi.fn()
  const value = {
    status: 'ready',
    entries: [],
    selection: 'all',
    period: 30,
    teamChosen: true,
    teamMembers: ROWS.map((r) => r.login),
    teamStats: () => ROWS,
    selectedMember: null,
    setSelectedMember,
    ...over,
  } as unknown as DashboardValue
  const ui = (v: DashboardValue) => (
    <DashboardContext.Provider value={v}>
      <TeamTable onChooseTeam={onChooseTeam} />
    </DashboardContext.Provider>
  )
  const utils = render(ui(value))
  return { ...utils, setSelectedMember, onChooseTeam, rerenderWith: (o: Partial<DashboardValue>) => utils.rerender(ui({ ...value, ...o })) }
}

function bodyLogins() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getByRole('rowheader').textContent)
}

// #89: rows no longer carry an aria-label ("<login>: select member"), which hid the row content from
// screen readers. Rows are now named by their content, so tests query them with /^login/ regexes;
// the "select a member" hint lives in the sr-only caption.
describe('TeamTable', () => {
  it('AC1 (#19), AC2 (#21): renders one row per member with all 10 columns', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))
    expect(headers).toEqual([
      'Member',
      'Opened',
      'Merged',
      'Closed',
      'Open',
      'Reviews given',
      'Reviews received',
      'Lines (+/−)',
      'PR size (lines)',
      '1st review',
    ])
    expect(screen.getAllByRole('row')).toHaveLength(4)
    const ana = screen.getByRole('row', { name: /^Ana/ })
    expect(within(ana).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      // #89: PR size is now a bare "300" (the unit moved to the header); 1st review keeps its unit.
      '5', '3', '1', '1', '4', '2', '+120−45', '300', '5.5 h',
    ])
    expect(within(screen.getByRole('row', { name: /^cy/ })).getAllByRole('cell')[0].textContent).toBe('0')
    expect(screen.getByText('Per member · All repositories · last 30 days')).toBeTruthy()
  })

  it('AC1, AC8 (#83): + and − figures sit in separate subcolumns with the add/del colours', () => {
    renderTable()
    const ana = screen.getByRole('row', { name: /^Ana/ })
    const img = within(ana).getByRole('img', { name: '120 added, 45 removed' })
    expect(img.children).toHaveLength(2)
    expect(img.children[0].textContent).toBe('+120')
    expect(img.children[1].textContent).toBe('−45')
    expect(img.children[0].className).toMatch(/add/)
    expect(img.children[1].className).toMatch(/del/)
    expect(img.className).toMatch(/columns/)
    expect(within(screen.getByRole('row', { name: /^cy/ })).getByRole('img', { name: '0 added, 0 removed' })).toBeTruthy()
  })

  it('AC9 (#83): header stays "Lines (+/−)" and sorting by Lines is unchanged', () => {
    renderTable()
    const btn = screen.getByRole('button', { name: 'Sort by Lines (+/−)' })
    fireEvent.click(btn)
    expect(bodyLogins()).toEqual(['cy', 'bob', 'Ana'])
    fireEvent.click(btn)
    expect(bodyLogins()).toEqual(['Ana', 'bob', 'cy'])
  })

  it('AC1 (#19): shows a loading line and nothing on error', () => {
    const { unmount } = renderTable({ status: 'loading' })
    expect(screen.getByText('Loading team data…')).toBeTruthy()
    unmount()
    const { container } = renderTable({ status: 'error' })
    expect(container.textContent).toBe('')
  })

  it('AC2 (#19): default sort is Merged descending', () => {
    renderTable()
    expect(bodyLogins()).toEqual(['bob', 'Ana', 'cy'])
    expect(screen.getByRole('columnheader', { name: /Merged/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('AC2 (#19): sort cycle, aria-sort and announcements', () => {
    renderTable()
    const status = screen.getByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    expect(bodyLogins()).toEqual(['cy', 'bob', 'Ana'])
    expect(screen.getByRole('columnheader', { name: /Opened/ }).getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByRole('columnheader', { name: /Merged/ }).getAttribute('aria-sort')).toBeNull()
    expect(status.textContent).toBe('Sorted by Opened, ascending.')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    expect(bodyLogins()).toEqual(['Ana', 'bob', 'cy'])
    expect(status.textContent).toBe('Sorted by Opened, descending.')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    expect(status.textContent).toBe('Sorted by Opened, ascending.')
  })

  it('AC2 (#19): Lines sorts by additions plus deletions and ties fall back to login', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Closed' }))
    // closed: Ana 1, bob 0, cy 0 -> ascending: bob, cy (tie by login), Ana
    expect(bodyLogins()).toEqual(['bob', 'cy', 'Ana'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Lines (+/−)' }))
    expect(bodyLogins()).toEqual(['cy', 'bob', 'Ana'])
  })

  it('AC2 (#21): PR size and 1st review columns sort, with n/a rows last in both directions', () => {
    renderTable()
    // Ana 300 lines / 5.5 h, bob 20 lines / 30 min, cy n/a.
    fireEvent.click(screen.getByRole('button', { name: 'Sort by PR size' }))
    expect(bodyLogins()).toEqual(['bob', 'Ana', 'cy'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by PR size' }))
    expect(bodyLogins()).toEqual(['Ana', 'bob', 'cy'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by 1st review' }))
    expect(bodyLogins()).toEqual(['bob', 'Ana', 'cy'])
    expect(screen.getByRole('columnheader', { name: /1st review/ }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by 1st review' }))
    expect(bodyLogins()).toEqual(['Ana', 'bob', 'cy'])
  })

  it('AC4 (#21): members without qualifying PRs show n/a, never 0 or NaN', () => {
    renderTable()
    const cells = within(screen.getByRole('row', { name: /^cy/ })).getAllByRole('cell')
    expect(cells.slice(-2).map((c) => c.textContent)).toEqual(['n/a', 'n/a'])
    expect(document.body).not.toHaveTextContent('NaN')
  })

  it('AC7 (#89): PR size cells hold only the bare number and the unit is in the header', () => {
    renderTable()
    const header = screen.getByRole('columnheader', { name: /PR size/ })
    expect(header.textContent).toContain('(lines)')
    const unit = header.querySelector('span span')
    expect(unit?.textContent).toBe('(lines)')
    const ana = within(screen.getByRole('row', { name: /^Ana/ })).getAllByRole('cell')
    expect(ana[7].textContent).toBe('300')
    for (const r of screen.getAllByRole('row').slice(1)) {
      expect(within(r).getAllByRole('cell')[7].textContent).not.toMatch(/lines?/)
    }
    // Documented deviation: 1st review keeps its per-cell unit and has no header unit.
    expect(ana[8].textContent).toBe('5.5 h')
    expect(screen.getByRole('columnheader', { name: /1st review/ }).textContent).not.toContain('(')
  })

  it('AC8 (#89): a missing metric renders n/a in a muted cell, like the numbers', () => {
    renderTable()
    const cy = within(screen.getByRole('row', { name: /^cy/ })).getAllByRole('cell')
    for (const c of cy.slice(-2)) {
      expect(c.textContent).toBe('n/a')
      expect(c.className).toMatch(/(^|[\s_])na([\s_]|$)/)
      expect(c.className).toMatch(/(^|[\s_])num([\s_]|$)/)
    }
    const ana = within(screen.getByRole('row', { name: /^Ana/ })).getAllByRole('cell')
    expect(ana[7].className).not.toMatch(/(^|[\s_])na([\s_]|$)/)
  })

  it('AC1 (#89), AC2 (#89): the arrow slot is always rendered in a stable position', () => {
    renderTable()
    const buttons = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.startsWith('Sort by'))
    const isArrow = (el: Element | null) => !!el && /(^|[\s_])arrow([\s_]|$)/.test(el.className)
    buttons.forEach((b, i) => {
      expect(b.children).toHaveLength(2)
      // Member (first) has the slot after the label; numeric columns have it before.
      expect(isArrow(i === 0 ? b.lastElementChild : b.firstElementChild)).toBe(true)
      expect(isArrow(i === 0 ? b.firstElementChild : b.lastElementChild)).toBe(false)
    })
    // Moving the sort changes only the arrow text, never the number of elements.
    const merged = screen.getByRole('button', { name: 'Sort by Merged' })
    expect(merged.firstElementChild?.textContent).toBe('▼')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    expect(merged.firstElementChild?.textContent).toBe('')
    expect(merged.children).toHaveLength(2)
  })

  it('AC4 (#89): login cells carry the classes that keep them on one line', () => {
    renderTable()
    const login = screen.getAllByRole('rowheader')[0]
    expect(login.className).toMatch(/(^|[\s_])login([\s_]|$)/)
    expect(login.className).toMatch(/(^|[\s_])memberCol([\s_]|$)/)
  })

  it('AC6 (#89): header cells are sticky-head cells and Member is the pinned corner', () => {
    renderTable()
    const heads = screen.getAllByRole('columnheader')
    for (const h of heads) expect(h.className).toMatch(/(^|[\s_])headCell([\s_]|$)/)
    expect(heads[0].className).toMatch(/(^|[\s_])memberCol([\s_]|$)/)
    expect(heads[1].className).not.toMatch(/(^|[\s_])memberCol([\s_]|$)/)
    expect(screen.getByRole('region', { name: 'Team table, scrollable' }).className).toMatch(/scroll/)
  })

  it('AC3 (#19): keeps the sort when the figures change', () => {
    const { rerenderWith } = renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    rerenderWith({ teamStats: () => [row('Ana', { opened: 9 }), row('bob', { opened: 1 }), row('cy', { opened: 4 })] })
    expect(bodyLogins()).toEqual(['bob', 'cy', 'Ana'])
  })

  it('AC4 (#19): click and Enter select a row, with aria-current and announcement', () => {
    const { setSelectedMember, rerenderWith } = renderTable()
    fireEvent.click(screen.getByRole('row', { name: /^bob/ }))
    expect(setSelectedMember).toHaveBeenCalledWith('bob')
    fireEvent.keyDown(screen.getByRole('row', { name: /^Ana/ }), { key: 'Enter' })
    expect(setSelectedMember).toHaveBeenLastCalledWith('Ana')
    expect(screen.getByRole('status').textContent).toBe('Selected Ana. Detail shown below the table.')
    expect(screen.getByRole('row', { name: /^Ana/ }).tabIndex).toBe(0)
    rerenderWith({ selectedMember: 'ana' })
    expect(screen.getByRole('row', { name: /^Ana/ }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('row', { name: /^bob/ }).getAttribute('aria-current')).toBeNull()
  })

  it('AC5 (#19): scroll container is labelled and focusable; table has a min-width class', () => {
    renderTable()
    const region = screen.getByRole('region', { name: 'Team table, scrollable' })
    expect(region.tabIndex).toBe(0)
    expect(region.querySelector('table')?.className).toContain('table')
  })

  it('AC5 (#89): data-scrolled is absent at rest and follows horizontal scroll', () => {
    renderTable()
    const region = screen.getByRole('region', { name: 'Team table, scrollable' })
    expect(region.hasAttribute('data-scrolled')).toBe(false)
    region.scrollLeft = 40
    fireEvent.scroll(region)
    expect(region.getAttribute('data-scrolled')).toBe('true')
    region.scrollLeft = 0
    fireEvent.scroll(region)
    expect(region.hasAttribute('data-scrolled')).toBe(false)
  })

  it('AC5 (#89): the initial state reflects an already scrolled region', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft')
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', { configurable: true, get: () => 25, set: () => {} })
    try {
      renderTable()
      expect(screen.getByRole('region', { name: 'Team table, scrollable' }).getAttribute('data-scrolled')).toBe('true')
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollLeft', original)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft
    }
  })

  it('AC11 (#89): rows have no aria-label and the hint is in the sr-only caption', () => {
    renderTable()
    for (const r of screen.getAllByRole('row')) expect(r.getAttribute('aria-label')).toBeNull()
    expect(screen.getByRole('table').querySelector('caption')?.textContent).toMatch(/select a member/i)
  })

  it('AC11 (#89): Space selects a row and keys on inner controls are ignored', () => {
    const { setSelectedMember } = renderTable()
    fireEvent.keyDown(screen.getByRole('row', { name: /^bob/ }), { key: ' ' })
    expect(setSelectedMember).toHaveBeenCalledWith('bob')
    setSelectedMember.mockClear()
    fireEvent.keyDown(screen.getByRole('rowheader', { name: 'bob' }), { key: 'Enter' })
    expect(setSelectedMember).not.toHaveBeenCalled()
  })

  it('AC6 (#19): empty state with a button that calls onChooseTeam', () => {
    const { onChooseTeam } = renderTable({ teamMembers: [], teamStats: () => [] })
    expect(
      screen.getByText('No team members selected. Choose the people to follow to see them here.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose team members' }))
    expect(onChooseTeam).toHaveBeenCalledTimes(1)
  })
})
