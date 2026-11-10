import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListReposResult } from '../../api/client'
import type { LinkedRepo } from '../../api/types'
import RepositoriesPanel from './RepositoriesPanel'
import type { RepositoriesPanelProps } from './RepositoriesPanel'

const NOW = new Date('2026-11-10T12:00:00Z')

const synced = (repo: string): LinkedRepo => ({
  repo,
  syncedAt: '2026-11-10T11:55:00Z',
  baseBranch: 'main',
  people: 3,
})

interface Setup {
  listRepos?: () => Promise<ListReposResult>
  getTokenStatus?: () => Promise<{ ok: true; configured: boolean } | { ok: false }>
  removeRepo?: (repo: string) => Promise<{ ok: boolean }>
}

function setup(s: Setup = {}) {
  const onChanged = vi.fn()
  const deps = {
    listRepos: vi.fn(
      s.listRepos ?? (async () => ({ ok: true as const, repos: [synced('acme/api'), synced('acme/web')] })),
    ),
    addRepo: vi.fn(async () => ({ ok: true as const, repo: 'acme/new', synced: true as const, people: 2 })),
    removeRepo: vi.fn(s.removeRepo ?? (async () => ({ ok: true }))),
    syncRepo: vi.fn(async () => ({ ok: true as const, people: 4 })),
    getTokenStatus: vi.fn(s.getTokenStatus ?? (async () => ({ ok: true as const, configured: true }))),
  }
  render(<RepositoriesPanel {...(deps as unknown as Omit<RepositoriesPanelProps, 'now' | 'onChanged'>)} now={() => NOW} onChanged={onChanged} />)
  return { deps, onChanged }
}

afterEach(cleanup)

describe('RepositoriesPanel', () => {
  it('#8 AC9: token configured, with the read-only note', async () => {
    setup()
    expect(screen.getByText('Checking token…')).toBeInTheDocument()
    await screen.findByText('Token configured.')
    expect(screen.getByText('This app only reads from GitHub.')).toBeInTheDocument()
  })

  it('#8 AC9: no token and token error lines', async () => {
    setup({ getTokenStatus: async () => ({ ok: true, configured: false }) })
    await screen.findByText('No token configured. Set GITHUB_TOKEN in .env and restart the server.')
    cleanup()
    setup({ getTokenStatus: async () => ({ ok: false }) })
    await screen.findByText('Could not check the token status.')
  })

  it('#8 AC10: loading, empty and error with Retry', async () => {
    let fail = true
    setup({
      listRepos: async () => (fail ? { ok: false, error: 'request_failed' } : { ok: true, repos: [] }),
    })
    expect(screen.getByText('Loading repositories…')).toBeInTheDocument()
    await screen.findByText(
      'Could not load repositories. Check that the local server is running, then reopen Settings.',
    )
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('No repositories linked yet.')
  })

  it('#8 AC2: onChanged fires after an add', async () => {
    const { onChanged } = setup()
    await screen.findByText('acme/api')
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Added acme/new. 2 people found.')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('#8 AC5: onChanged fires after a sync and the list refetches', async () => {
    const { onChanged, deps } = setup()
    await screen.findByText('acme/api')
    fireEvent.click(screen.getByRole('button', { name: 'Sync acme/api' }))
    await screen.findByText('Synced just now. 4 people found.')
    expect(onChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalledTimes(2))
  })

  it('#8 AC4: onChanged fires after a remove', async () => {
    const { onChanged } = setup()
    await screen.findByText('acme/api')
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    await screen.findByText('Removed acme/api.')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('#8 AC4: a stale refetch resolving after a remove does not bring the row back', async () => {
    let calls = 0
    let resolveStale: (r: ListReposResult) => void = () => {}
    const { deps } = setup({
      listRepos: () => {
        calls++
        if (calls === 2) return new Promise((r) => (resolveStale = r))
        return Promise.resolve({ ok: true, repos: [synced('acme/api'), synced('acme/web')] })
      },
    })
    await screen.findByText('acme/api')
    // Sync triggers a refetch (call 2) that stays pending.
    fireEvent.click(screen.getByRole('button', { name: 'Sync acme/web' }))
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    await screen.findByText('Removed acme/api.')
    resolveStale({ ok: true, repos: [synced('acme/api'), synced('acme/web')] })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('acme/api')).toBeNull()
    expect(screen.getByText('acme/web')).toBeInTheDocument()
  })
})
