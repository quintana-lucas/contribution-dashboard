import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDeps, storedRepo } from '../../test/fakeDeps'
import DashboardProvider, { useDashboard } from '.'

function Consumer() {
  const { status, selection, period, setSelection, setPeriod } = useDashboard()
  return (
    <div>
      <p data-testid="state">{`${status}|${selection}|${period}`}</p>
      <button onClick={() => setSelection('acme/web')}>pick</button>
      <button onClick={() => setPeriod(7)}>seven</button>
      <button onClick={() => setPeriod(90)}>ninety</button>
    </div>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardProvider', () => {
  it('#16 AC2: starts with all repositories and a 30 day period', async () => {
    render(
      <DashboardProvider {...makeDeps()}>
        <Consumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|all|30'))
  })

  it('#16 AC6: status goes loading then ready after one load', async () => {
    const deps = makeDeps()
    render(
      <DashboardProvider {...deps}>
        <Consumer />
      </DashboardProvider>,
    )
    expect(screen.getByTestId('state')).toHaveTextContent('loading|all|30')
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|all|30'))
    expect(deps.listRepos).toHaveBeenCalledTimes(1)
    expect(deps.getRepoData).toHaveBeenCalledTimes(2) // only synced repos are fetched
  })

  it('#16 AC6: no fetch after the initial load on setSelection or setPeriod', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const deps = makeDeps()
    render(
      <DashboardProvider {...deps}>
        <Consumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'))
    const calls = deps.getRepoData.mock.calls.length
    act(() => {
      fireEvent.click(screen.getByText('pick'))
      fireEvent.click(screen.getByText('seven'))
      fireEvent.click(screen.getByText('ninety'))
    })
    expect(screen.getByTestId('state')).toHaveTextContent('ready|acme/web|90')
    expect(deps.listRepos).toHaveBeenCalledTimes(1)
    expect(deps.getRepoData).toHaveBeenCalledTimes(calls)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('#16 AC6: the error state is reached when the list fails', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: false as const, error: 'request_failed' as const })),
    }
    render(
      <DashboardProvider {...deps}>
        <Consumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error|all|30'))
  })

  it('#8 AC1: reload sets loading, re-lists, and resets a selection whose repo is gone', async () => {
    const deps = makeDeps()
    function ReloadConsumer() {
      const { reload } = useDashboard()
      return <button onClick={reload}>reload</button>
    }
    render(
      <DashboardProvider {...deps}>
        <Consumer />
        <ReloadConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|all|30'))
    fireEvent.click(screen.getByText('pick')) // acme/web
    // Selection kept while its repo still exists.
    fireEvent.click(screen.getByText('reload'))
    expect(screen.getByTestId('state')).toHaveTextContent('loading|acme/web|30')
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|acme/web|30'))
    expect(deps.listRepos).toHaveBeenCalledTimes(2)
    // The repo disappears: selection goes back to all.
    deps.listRepos.mockImplementation(async () => ({
      ok: true as const,
      repos: [{ repo: 'acme/api', syncedAt: null, baseBranch: null, people: null }],
    }))
    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|all|30'))
  })

  function TeamConsumer() {
    const { status, teamChosen, subline, selectActivity } = useDashboard()
    return (
      <p data-testid="team">{`${status}|${teamChosen}|${subline}|${selectActivity().teamMemberCount}`}</p>
    )
  }

  it('#15 AC4: only selected logins count in the subline and the activity', async () => {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      selected: ['ANA', 'cy'], // compared case-insensitively
      added: [],
    }))
    render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team')).toHaveTextContent('ready|true'))
    expect(screen.getByTestId('team')).toHaveTextContent('2 members')
    expect(screen.getByTestId('team').textContent).toMatch(/\|2$/)
  })

  it('#15 AC4: the selection persists across a remount with the same store', async () => {
    const store = { selected: ['ana'] as string[] | null }
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      selected: store.selected,
      added: [],
    }))
    const first = render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team').textContent).toMatch(/^ready\|true.*\|1$/))
    first.unmount()
    render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team').textContent).toMatch(/^ready\|true.*\|1$/))
  })

  it('#15 AC5: a null selection means the team is not chosen, and every login counts', async () => {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({ ok: true as const, candidates: [], selected: null, added: [] }))
    render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team')).toHaveTextContent('ready|false'))
    expect(screen.getByTestId('team').textContent).toMatch(/\|4$/)
  })

  it('#15 AC4: a failed team load sets the error status', async () => {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({ ok: false as const }))
    render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team')).toHaveTextContent('error|false'))
  })

  function TableConsumer() {
    const { status, teamMembers, teamStats, selectedMember, setSelectedMember, setSelection, setPeriod, reload } =
      useDashboard()
    const rows = status === 'ready' ? teamStats() : []
    return (
      <div>
        <p data-testid="members">{`${status}|${teamMembers.join(',')}`}</p>
        <p data-testid="opened">{rows.map((r) => `${r.login}:${r.opened}`).join(',')}</p>
        <p data-testid="selected">{String(selectedMember)}</p>
        <button onClick={() => setSelectedMember('ANA')}>select ana</button>
        <button onClick={() => setSelectedMember(null)}>clear</button>
        <button onClick={() => setSelection('acme/web')}>web</button>
        <button onClick={() => setSelection('all')}>all</button>
        <button onClick={() => setPeriod(7)}>seven</button>
        <button onClick={reload}>reload</button>
      </div>
    )
  }

  function teamOf(selected: string[] | null) {
    const deps = makeDeps()
    const store = { selected }
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      selected: store.selected,
      added: [],
    }))
    return { deps, store }
  }

  it('#19 AC1: teamMembers keeps the original casing, deduplicated, and is [] when not chosen', async () => {
    const { deps, store } = teamOf(['Ana', 'BOB', 'ana'])
    const view = render(
      <DashboardProvider {...deps}>
        <TableConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('members')).toHaveTextContent('ready|Ana,BOB'))
    expect(screen.getByTestId('opened')).toHaveTextContent('Ana:2,BOB:1')
    view.unmount()
    store.selected = null
    render(
      <DashboardProvider {...deps}>
        <TableConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('members').textContent).toBe('ready|'))
  })

  it('#19 AC3: teamStats() reflects selection and period changes', async () => {
    const { deps } = teamOf(['ana', 'bob'])
    // bob's PR in acme/api is older: inside 30 days, outside 7.
    deps.getRepoData.mockImplementation(async (repo: string) => {
      const base = storedRepo(repo, '2026-06-15T09:00:00.000Z', repo === 'acme/api' ? ['ana', 'bob'] : ['ana', 'cy'])
      if (repo === 'acme/api') base.pullRequests[1].createdAt = '2026-06-01T10:00:00.000Z'
      return { ok: true as const, data: base }
    })
    render(
      <DashboardProvider {...deps}>
        <TableConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('opened')).toHaveTextContent('ana:2,bob:1'))
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('opened')).toHaveTextContent('ana:1,bob:0')
    fireEvent.click(screen.getByText('all'))
    expect(screen.getByTestId('opened')).toHaveTextContent('ana:2,bob:1')
    fireEvent.click(screen.getByText('seven'))
    expect(screen.getByTestId('opened')).toHaveTextContent('ana:2,bob:0')
  })

  it('#19 AC4: selectedMember can be set and cleared', async () => {
    const { deps } = teamOf(['ana'])
    render(
      <DashboardProvider {...deps}>
        <TableConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('members')).toHaveTextContent('ready'))
    expect(screen.getByTestId('selected')).toHaveTextContent('null')
    fireEvent.click(screen.getByText('select ana'))
    expect(screen.getByTestId('selected')).toHaveTextContent('ANA')
    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('selected')).toHaveTextContent('null')
  })

  it('#19 AC4: selectedMember is kept on reload while in the team and cleared when removed', async () => {
    const { deps, store } = teamOf(['ana', 'bob'])
    render(
      <DashboardProvider {...deps}>
        <TableConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('members')).toHaveTextContent('ready|ana,bob'))
    fireEvent.click(screen.getByText('select ana')) // 'ANA', case-insensitive match
    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(screen.getByTestId('members')).toHaveTextContent('ready|ana,bob'))
    expect(screen.getByTestId('selected')).toHaveTextContent('ANA')
    store.selected = ['bob']
    fireEvent.click(screen.getByText('reload'))
    await waitFor(() => expect(screen.getByTestId('members')).toHaveTextContent('ready|bob'))
    expect(screen.getByTestId('selected')).toHaveTextContent('null')
  })

  it('#20 AC1: memberDetail() is null without a selection and follows the selected member', async () => {
    const { deps } = teamOf(['ana', 'bob'])
    function DetailConsumer() {
      const { status, memberDetail, setSelectedMember, setSelection } = useDashboard()
      const detail = status === 'ready' ? memberDetail() : null
      return (
        <div>
          <p data-testid="detail">{detail === null ? 'none' : `${detail.login}|${detail.recentTotal}`}</p>
          <button onClick={() => setSelectedMember('ANA')}>select ana</button>
          <button onClick={() => setSelection('acme/web')}>web</button>
        </div>
      )
    }
    render(
      <DashboardProvider {...deps}>
        <DetailConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(deps.getRepoData).toHaveBeenCalled())
    expect(screen.getByTestId('detail')).toHaveTextContent('none')
    fireEvent.click(screen.getByText('select ana'))
    expect(screen.getByTestId('detail')).toHaveTextContent('ANA|2')
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('detail')).toHaveTextContent('ANA|1')
  })

  it('#16 AC6: useDashboard throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<Consumer />)).toThrow(
        'useDashboard must be used inside DashboardProvider',
      )
    } finally {
      spy.mockRestore()
    }
  })
})
