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
    ...over,
  }
}

const ROWS = [
  row('Ana', { opened: 5, merged: 3, closed: 1, open: 1, reviewsGiven: 4, reviewsReceived: 2, additions: 120, deletions: 45 }),
  row('bob', { opened: 2, merged: 5, additions: 10, deletions: 10 }),
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

describe('TeamTable', () => {
  it('AC1: renders one row per member with all 8 columns', () => {
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
    ])
    expect(screen.getAllByRole('row')).toHaveLength(4)
    const ana = screen.getByRole('row', { name: 'Ana: select member' })
    expect(within(ana).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '5', '3', '1', '1', '4', '2', '+120 −45',
    ])
    expect(within(screen.getByRole('row', { name: 'cy: select member' })).getAllByRole('cell')[0].textContent).toBe('0')
    expect(screen.getByText('Per member · All repositories · last 30 days')).toBeTruthy()
  })

  it('AC1: shows a loading line and nothing on error', () => {
    const { unmount } = renderTable({ status: 'loading' })
    expect(screen.getByText('Loading team data…')).toBeTruthy()
    unmount()
    const { container } = renderTable({ status: 'error' })
    expect(container.textContent).toBe('')
  })

  it('AC2: default sort is Merged descending', () => {
    renderTable()
    expect(bodyLogins()).toEqual(['bob', 'Ana', 'cy'])
    expect(screen.getByRole('columnheader', { name: /Merged/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('AC2: sort cycle, aria-sort and announcements', () => {
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

  it('AC2: Lines sorts by additions plus deletions and ties fall back to login', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Closed' }))
    // closed: Ana 1, bob 0, cy 0 -> ascending: bob, cy (tie by login), Ana
    expect(bodyLogins()).toEqual(['bob', 'cy', 'Ana'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Lines (+/−)' }))
    expect(bodyLogins()).toEqual(['cy', 'bob', 'Ana'])
  })

  it('AC3: keeps the sort when the figures change', () => {
    const { rerenderWith } = renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }))
    rerenderWith({ teamStats: () => [row('Ana', { opened: 9 }), row('bob', { opened: 1 }), row('cy', { opened: 4 })] })
    expect(bodyLogins()).toEqual(['bob', 'cy', 'Ana'])
  })

  it('AC4: click and Enter select a row, with aria-current and announcement', () => {
    const { setSelectedMember, rerenderWith } = renderTable()
    fireEvent.click(screen.getByRole('row', { name: 'bob: select member' }))
    expect(setSelectedMember).toHaveBeenCalledWith('bob')
    fireEvent.keyDown(screen.getByRole('row', { name: 'Ana: select member' }), { key: 'Enter' })
    expect(setSelectedMember).toHaveBeenLastCalledWith('Ana')
    expect(screen.getByRole('status').textContent).toBe('Selected Ana.')
    expect(screen.getByRole('row', { name: 'Ana: select member' }).tabIndex).toBe(0)
    rerenderWith({ selectedMember: 'ana' })
    expect(screen.getByRole('row', { name: 'Ana: select member' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('row', { name: 'bob: select member' }).getAttribute('aria-current')).toBeNull()
  })

  it('AC5: scroll container is labelled and focusable; table has a min-width class', () => {
    renderTable()
    const region = screen.getByRole('region', { name: 'Team table, scrollable' })
    expect(region.tabIndex).toBe(0)
    expect(region.querySelector('table')?.className).toContain('table')
  })

  it('AC6: empty state with a button that calls onChooseTeam', () => {
    const { onChooseTeam } = renderTable({ teamMembers: [], teamStats: () => [] })
    expect(
      screen.getByText('No team members selected. Choose the people to follow to see them here.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose team members' }))
    expect(onChooseTeam).toHaveBeenCalledTimes(1)
  })
})
