import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDeps } from '../../test/fakeDeps'
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
