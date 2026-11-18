import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncRunState } from '../../api/client'
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

  function withDamaged(damagedRepos?: { repo: string; fileError: 'invalid_json' | 'unreadable' }[]) {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      selected: ['ana', 'bob', 'cy', 'dee'],
      added: [],
      ...(damagedRepos ? { damagedRepos } : {}),
    }))
    return deps
  }
  async function subline(deps: ReturnType<typeof makeDeps>) {
    render(
      <DashboardProvider {...deps}>
        <TeamConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('team')).toHaveTextContent('ready|true'))
    return screen.getByTestId('team').textContent ?? ''
  }

  it('#58 AC3: an invalid_json damaged repo shows its name and the damaged text', async () => {
    const text = await subline(withDamaged([{ repo: 'acme/broken', fileError: 'invalid_json' }]))
    expect(text).toContain('acme/broken: repository data file is damaged (invalid JSON)')
  })

  it('#58 AC4: an unreadable damaged repo shows its name and the could not be read text', async () => {
    const text = await subline(withDamaged([{ repo: 'acme/locked', fileError: 'unreadable' }]))
    expect(text).toContain('acme/locked: repository data file could not be read')
  })

  it('#58 AC5: the damaged text contains no path, file name or content', async () => {
    const text = await subline(withDamaged([{ repo: 'acme/broken', fileError: 'invalid_json' }]))
    expect(text).not.toMatch(/\.json|[\\/]data|\/home|[A-Z]:\\/)
  })

  it('#58 AC6: several damaged repos each show their own reason', async () => {
    const text = await subline(
      withDamaged([
        { repo: 'acme/one', fileError: 'invalid_json' },
        { repo: 'acme/two', fileError: 'unreadable' },
      ]),
    )
    expect(text).toContain('acme/one: repository data file is damaged (invalid JSON)')
    expect(text).toContain('acme/two: repository data file could not be read')
  })

  it('#58 AC7: without damaged repos the subline is unchanged', async () => {
    const plain = await subline(withDamaged())
    expect(plain).toBe('ready|true|3 repositories · 4 members · synced 3 h ago (1 not synced yet)|4')
    cleanup()
    expect(await subline(withDamaged([]))).toBe(plain)
  })

  it('#58 AC8: healthy repos keep showing alongside damaged ones', async () => {
    const text = await subline(withDamaged([{ repo: 'acme/broken', fileError: 'invalid_json' }]))
    expect(text).toContain('4 members')
    expect(text).toMatch(/\|4$/)
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

  function EntriesConsumer() {
    const { status, entries, setSelection, subline } = useDashboard()
    return (
      <div>
        <p data-testid="entries">
          {`${status}|${entries.map((e) => `${e.repo}:${e.error ?? (e.data ? 'data' : 'none')}`).join(',')}`}
        </p>
        <p data-testid="subline">{subline}</p>
        <button onClick={() => setSelection('acme/web')}>web</button>
      </div>
    )
  }

  it('#34 AC1: all synced repos are requested before any of them resolves', async () => {
    const deps = makeDeps()
    const resolvers: Array<() => void> = []
    deps.getRepoData.mockImplementation(
      (repo: string) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) }))
        }),
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(deps.getRepoData).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('entries')).toHaveTextContent(/^loading/)
    resolvers.forEach((resolve) => resolve())
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent(/^ready/))
  })

  it('#34 AC2: a failing repo gets its own error and the others keep their data', async () => {
    const deps = makeDeps()
    deps.getRepoData.mockImplementation(async (repo: string) =>
      repo === 'acme/api'
        ? { ok: false as const, error: 'request_failed' as const }
        : { ok: true as const, data: storedRepo(repo, '2026-06-15T11:30:00.000Z', ['ana']) },
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('entries')).toHaveTextContent(
        'ready|acme/api:request_failed,acme/web:data,acme/new:none',
      ),
    )
    expect(screen.getByTestId('subline')).toHaveTextContent('1 could not be loaded')
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('subline')).not.toHaveTextContent('could not')
  })

  it('#34 AC2: a getRepoData that throws is also isolated to its repo', async () => {
    const deps = makeDeps()
    deps.getRepoData.mockImplementation(async (repo: string) => {
      if (repo === 'acme/web') throw new Error('boom')
      return { ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) }
    })
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('entries')).toHaveTextContent('ready|acme/api:data,acme/web:request_failed'),
    )
  })

  it('#34 AC2: the failed repo shows its own message when selected', async () => {
    const deps = makeDeps()
    deps.getRepoData.mockImplementation(async (repo: string) =>
      repo === 'acme/web'
        ? { ok: false as const, error: 'request_failed' as const }
        : { ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) },
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent(/^ready/))
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('subline')).toHaveTextContent(/^could not load this repository$/)
  })

  it('#34 AC3: a not_synced repo stays "not synced", distinct from an error', async () => {
    const deps = makeDeps()
    deps.getRepoData.mockImplementation(async (repo: string) =>
      repo === 'acme/web'
        ? { ok: false as const, error: 'not_synced' as const }
        : { ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) },
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('entries')).toHaveTextContent('ready|acme/api:data,acme/web:none,acme/new:none'),
    )
    expect(screen.getByTestId('subline')).toHaveTextContent('2 not synced yet')
    expect(screen.getByTestId('subline')).not.toHaveTextContent('could not')
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('subline')).toHaveTextContent(/^not synced yet$/)
  })

  it('#35 AC1: invalid_json and unreadable results become corrupt and unreadable entries', async () => {
    const deps = makeDeps()
    deps.getRepoData.mockImplementation(async (repo: string) =>
      repo === 'acme/api'
        ? { ok: false as const, error: 'invalid_json' as const }
        : repo === 'acme/web'
          ? { ok: false as const, error: 'unreadable' as const }
          : { ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) },
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('entries')).toHaveTextContent('ready|acme/api:corrupt,acme/web:unreadable,acme/new:none'),
    )
    fireEvent.click(screen.getByText('web'))
    expect(screen.getByTestId('subline')).toHaveTextContent(/^repository data file could not be read$/)
    expect(screen.getByTestId('subline')).not.toHaveTextContent('not synced')
  })

  it('#35 AC3: a repo flagged by the list is corrupt without a data request, others stay healthy', async () => {
    const deps = makeDeps()
    deps.listRepos.mockImplementation(async () => ({
      ok: true as const,
      repos: [
        { repo: 'acme/api', syncedAt: null, baseBranch: null, people: null, fileError: 'invalid_json' as const },
        { repo: 'acme/web', syncedAt: '2026-06-15T09:00:00.000Z', baseBranch: 'main', people: 1 },
      ],
    }))
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('ready|acme/api:corrupt,acme/web:data'))
    expect(deps.getRepoData).not.toHaveBeenCalledWith('acme/api')
  })

  it('#34 AC4: a failed repo list still gives the global error state', async () => {
    const deps = makeDeps()
    deps.listRepos.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent(/^error\|$/))
    expect(deps.getRepoData).not.toHaveBeenCalled()
  })

  it('#34 AC5: repos keep their original order when results arrive reversed', async () => {
    const deps = makeDeps()
    const resolvers: Record<string, () => void> = {}
    deps.getRepoData.mockImplementation(
      (repo: string) =>
        new Promise((resolve) => {
          resolvers[repo] = () =>
            resolve({ ok: true as const, data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']) })
        }),
    )
    render(
      <DashboardProvider {...deps}>
        <EntriesConsumer />
      </DashboardProvider>,
    )
    await waitFor(() => expect(deps.getRepoData).toHaveBeenCalledTimes(2))
    resolvers['acme/web']()
    resolvers['acme/api']()
    await waitFor(() =>
      expect(screen.getByTestId('entries')).toHaveTextContent('ready|acme/api:data,acme/web:data,acme/new:none'),
    )
  })

  describe('all-repos sync (#65)', () => {
    const run = (over: Partial<SyncRunState> = {}): SyncRunState => ({
      running: true,
      total: 3,
      index: 1,
      current: 'acme/api',
      results: [],
      ...over,
    })
    const finishedRun = run({
      running: false,
      index: 3,
      current: null,
      results: [
        { repo: 'acme/api', ok: true },
        { repo: 'acme/web', ok: false, code: 'rate_limited' },
        { repo: 'acme/new', ok: true },
      ],
    })

    function SyncConsumer() {
      const { status, syncState, syncRunning, startSync, dismissSync } = useDashboard()
      return (
        <div>
          <p data-testid="sync">{`${status}|${syncRunning}|${JSON.stringify(syncState)}`}</p>
          <button onClick={startSync}>start</button>
          <button onClick={dismissSync}>dismiss</button>
        </div>
      )
    }
    const mount = (deps: ReturnType<typeof makeDeps>) =>
      render(
        <DashboardProvider {...deps}>
          <SyncConsumer />
        </DashboardProvider>,
      )
    const text = () => screen.getByTestId('sync').textContent ?? ''

    afterEach(() => {
      vi.useRealTimers()
    })

    it('#65 AC11: mounting while a run is in progress resumes its progress', async () => {
      const deps = makeDeps()
      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: run({ index: 2 }) }))
      mount(deps)
      await waitFor(() => expect(text()).toContain('"status":"running"'))
      expect(text()).toContain('|true|')
      expect(text()).toContain('"index":2')
    })

    it('#65 AC11: mounting idle, or after a run finished while closed, shows nothing', async () => {
      const deps = makeDeps()
      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: finishedRun }))
      mount(deps)
      await waitFor(() => expect(deps.getSyncState).toHaveBeenCalled())
      await waitFor(() => expect(text()).toMatch(/^ready/))
      expect(text()).toBe('ready|false|null')
    })

    it('#65 AC3: calling startSync twice in a row posts once', async () => {
      const deps = makeDeps()
      mount(deps)
      await waitFor(() => expect(text()).toMatch(/^ready/))
      act(() => {
        fireEvent.click(screen.getByText('start'))
        fireEvent.click(screen.getByText('start'))
      })
      await waitFor(() => expect(text()).toContain('"status":"running"'))
      fireEvent.click(screen.getByText('start')) // still running
      expect(deps.startSync).toHaveBeenCalledTimes(1)
    })

    it('#65 AC2: polls about every second only while running, and stops when it finishes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const deps = makeDeps()
      mount(deps)
      await waitFor(() => expect(text()).toMatch(/^ready/))
      const idleCalls = deps.getSyncState.mock.calls.length // the mount read
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(deps.getSyncState).toHaveBeenCalledTimes(idleCalls) // idle: no polling

      fireEvent.click(screen.getByText('start'))
      await waitFor(() => expect(text()).toContain('"status":"running"'))
      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: run({ index: 2, current: 'acme/web' }) }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(deps.getSyncState).toHaveBeenCalledTimes(idleCalls + 1)
      expect(text()).toContain('"index":2')

      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: finishedRun }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(text()).toContain('"status":"finished"')
      const after = deps.getSyncState.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(deps.getSyncState).toHaveBeenCalledTimes(after)
    })

    it('#65 AC4: at the end the repo data reloads silently, without a loading flash', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const deps = makeDeps()
      mount(deps)
      await waitFor(() => expect(text()).toMatch(/^ready/))
      const lists = deps.listRepos.mock.calls.length
      fireEvent.click(screen.getByText('start'))
      await waitFor(() => expect(text()).toContain('"status":"running"'))
      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: finishedRun }))
      const seen: string[] = []
      const observer = new MutationObserver(() => seen.push(text()))
      observer.observe(screen.getByTestId('sync'), { childList: true, characterData: true, subtree: true })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await waitFor(() => expect(deps.listRepos).toHaveBeenCalledTimes(lists + 1))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
      observer.disconnect()
      expect(text()).toContain('"status":"finished"')
      expect(seen.some((s) => s.startsWith('loading'))).toBe(false)
      expect(text()).toMatch(/^ready/)
    })

    it('#65 AC7: a start error is kept in state, and dismiss clears it', async () => {
      const deps = makeDeps()
      deps.startSync.mockImplementation(async () => ({
        ok: false as const,
        error: 'missing_token' as const,
        message: 'Token not configured',
      }))
      mount(deps)
      await waitFor(() => expect(text()).toMatch(/^ready/))
      fireEvent.click(screen.getByText('start'))
      await waitFor(() => expect(text()).toContain('"error":"missing_token"'))
      expect(text()).toContain('|false|')
      fireEvent.click(screen.getByText('dismiss'))
      expect(text()).toBe('ready|false|null')
    })

    it('#65 AC3: already_running adopts the run in progress instead of failing', async () => {
      const deps = makeDeps()
      mount(deps)
      await waitFor(() => expect(text()).toMatch(/^ready/))
      deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'already_running' as const }))
      deps.getSyncState.mockImplementation(async () => ({ ok: true as const, state: run({ index: 2 }) }))
      fireEvent.click(screen.getByText('start'))
      await waitFor(() => expect(text()).toContain('"status":"running"'))
    })
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
