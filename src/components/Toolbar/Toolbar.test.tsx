import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DashboardProvider, { useDashboard } from '../DashboardProvider'
import { makeDeps } from '../../test/fakeDeps'
import Toolbar from './Toolbar'

function Probe() {
  const { period, selection, selectActivity } = useDashboard()
  const a = selectActivity()
  return (
    <p data-testid="probe">
      {`${selection}|${period}|${a.buckets.length}|${a.teamMemberCount}`}
    </p>
  )
}

async function renderToolbar(deps = makeDeps()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <Probe />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return deps
}

describe('Toolbar', () => {
  it('#16 AC1: the selector lists All repositories plus each repo', async () => {
    await renderToolbar()
    const select = screen.getByLabelText('Repository')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All repositories',
      'acme/api',
      'acme/web',
      'acme/new',
    ])
  })

  it('#16 AC1: the subline changes when one repo is picked', async () => {
    await renderToolbar()
    expect(screen.getByRole('status')).toHaveTextContent(
      '3 repositories · 4 members · synced 3 h ago (1 not synced yet)',
    )
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/api' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Base branch develop · 2 members · synced 3 h ago',
    )
  })

  it('#102 follow-up: shows skeletons, no loading text and aria-busy before data arrives', () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    const { container } = render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    const group = screen.getByRole('group', { name: 'Dashboard filters' })
    expect(group).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    expect(container).not.toHaveTextContent(/loading/i)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByLabelText('Repository')).toBeNull()
  })

  it('#143 AC3: the loading skeleton has no Sync placeholder (field labels, selects and subline only)', () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    // Two label + two control placeholders plus the subline one.
    expect(screen.getAllByTestId('skeleton')).toHaveLength(5)
  })

  it('#16 AC2: 30 days is checked by default', async () => {
    await renderToolbar()
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked()
    expect(screen.getByTestId('probe')).toHaveTextContent('all|30|5|')
  })

  it('#16 AC2: changing the period updates useDashboard values', async () => {
    await renderToolbar()
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('all|7|7|4')
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('all|90|13|4')
  })

  it('#16 AC3: a never-synced repo shows only "not synced yet"', async () => {
    await renderToolbar()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/new' } })
    expect(screen.getByRole('status')).toHaveTextContent(/^not synced yet$/)
  })

  it('#16 AC5: controls have accessible names', async () => {
    await renderToolbar()
    expect(screen.getByRole('group', { name: 'Dashboard filters' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Repository' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    for (const name of ['7 days', '30 days', '90 days']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
  })

  // jsdom does not implement Tab order or arrow-key movement in radio groups, and the
  // project has no user-event. So this checks the native structure those behaviors need:
  // select before the period group in DOM order, one shared radio name, no tabindex
  // overrides, a fieldset/legend, and that selecting a radio changes the period.
  it('#16 AC5: select comes before the native period radio group; selecting changes the period', async () => {
    await renderToolbar()
    const select = screen.getByLabelText('Repository')
    const radios = screen.getAllByRole('radio')
    expect(
      select.compareDocumentPosition(radios[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1)
    for (const el of [select, ...radios]) expect(el).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('group', { name: 'Period' }).tagName).toBe('FIELDSET')
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['7', '30', '90'])
    fireEvent.click(radios[2])
    expect(radios[2]).toBeChecked()
    expect(screen.getByTestId('probe')).toHaveTextContent('all|90|')
    fireEvent.click(radios[0])
    expect(radios[0]).toBeChecked()
  })

  it('#16 AC6: the error state shows the message and no controls', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: false as const, error: 'request_failed' as const })),
    }
    render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not load repository data. Check that the local server is running, then reload the page.',
    )
    expect(screen.queryByLabelText('Repository')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('#143 AC3: has no Sync button, progress line or result, only the filters', async () => {
    await renderToolbar()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('#65 AC8: no repos renders no Toolbar', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })),
    }
    const { container } = render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
