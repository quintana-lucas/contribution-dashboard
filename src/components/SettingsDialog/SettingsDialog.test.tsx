import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddRepoResult, SyncResult } from '../../api/client'
import type { LinkedRepo } from '../../api/types'
import SettingsDialog from './SettingsDialog'

const NOW = new Date('2026-11-10T12:00:00Z')
const FAKE_TOKEN = 'ghp_FAKE_TOKEN_1234567890'

const synced = (repo: string, people = 3): LinkedRepo => ({
  repo,
  syncedAt: '2026-11-10T11:55:00Z',
  baseBranch: 'main',
  people,
})
const unsynced = (repo: string): LinkedRepo => ({ repo, syncedAt: null, baseBranch: null, people: null })

interface Setup {
  repos?: LinkedRepo[]
  listRepos?: () => Promise<{ ok: true; repos: LinkedRepo[] } | { ok: false; error: 'request_failed' }>
  addRepo?: (input: string) => Promise<AddRepoResult>
  removeRepo?: (repo: string) => Promise<{ ok: boolean }>
  syncRepo?: (repo: string) => Promise<SyncResult>
  getTokenStatus?: () => Promise<{ ok: true; configured: boolean } | { ok: false }>
}

function setup(s: Setup = {}) {
  const onClose = vi.fn()
  const state = { repos: s.repos ?? [synced('acme/api'), synced('acme/web')] }
  const deps = {
    listRepos: vi.fn(s.listRepos ?? (async () => ({ ok: true as const, repos: state.repos }))),
    addRepo: vi.fn(s.addRepo ?? (async () => ({ ok: true as const, repo: 'acme/new', synced: true as const, people: 2 }))),
    // A successful remove also updates the fake server, because the panel refetches after it.
    removeRepo: vi.fn(
      s.removeRepo ??
        (async (repo: string) => {
          state.repos = state.repos.filter((r) => r.repo !== repo)
          return { ok: true }
        }),
    ),
    syncRepo: vi.fn(s.syncRepo ?? (async () => ({ ok: true as const, people: 4 }))),
    getTokenStatus: vi.fn(s.getTokenStatus ?? (async () => ({ ok: true as const, configured: true }))),
  }
  render(<SettingsDialog open onClose={onClose} now={() => NOW} {...(deps as object)} />)
  return { onClose, deps, state }
}

async function ready() {
  await screen.findByText('Linked repositories')
  await waitFor(() => expect(screen.queryByText('Loading repositories…')).toBeNull())
}

const field = () => screen.getByLabelText('Repository')
const addButton = () => screen.getByRole('button', { name: 'Add' })

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SettingsDialog', () => {
  it('#8 AC11: two tabs, focus on the selected tab, Team members placeholder', async () => {
    setup()
    await ready()
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Repositories', 'Team members'])
    expect(screen.getByRole('tab', { name: 'Repositories' })).toHaveFocus()
    fireEvent.click(screen.getByRole('tab', { name: 'Team members' }))
    expect(screen.getByText('Choosing your team arrives in a later update.')).toBeVisible()
  })

  it('#8 AC11: onClose(false) with no change, onClose(true) after a success', async () => {
    const a = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(a.onClose).toHaveBeenCalledWith(false)
    cleanup()

    const b = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Sync acme/api' }))
    await screen.findByText('Synced just now. 4 people found.')
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(b.onClose).toHaveBeenCalledWith(true)
  })

  it('#8 AC11: Esc closes the dialog', async () => {
    const { onClose } = setup()
    await ready()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Repositories' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(false)
  })

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
    expect(screen.getByText('This app only reads from GitHub.')).toBeInTheDocument()
  })

  it('#8 AC10: row details, singular people, and Not synced yet', async () => {
    setup({ repos: [synced('acme/api', 3), synced('acme/one', 1), unsynced('acme/new')] })
    await ready()
    expect(screen.getByText('Base branch main · 3 people · synced 5 min ago')).toBeInTheDocument()
    expect(screen.getByText('Base branch main · 1 person · synced 5 min ago')).toBeInTheDocument()
    expect(screen.getByText('Not synced yet')).toBeInTheDocument()
  })

  it('#8 AC10: a synced repo with no PRs drops the base branch part', async () => {
    setup({ repos: [{ repo: 'acme/empty', syncedAt: '2026-11-10T11:55:00Z', baseBranch: null, people: 0 }] })
    await ready()
    expect(screen.getByText('0 people · synced 5 min ago')).toBeInTheDocument()
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

  it('#8 AC2: add a repo and see it in the list', async () => {
    const state = { repos: [synced('acme/api')] }
    const { deps } = setup({
      listRepos: async () => ({ ok: true, repos: state.repos }),
      addRepo: async () => {
        state.repos = [...state.repos, synced('acme/new')]
        return { ok: true, repo: 'acme/new', synced: true, people: 2 }
      },
    })
    await ready()
    fireEvent.change(field(), { target: { value: ' acme/new ' } })
    fireEvent.submit(field().closest('form') as HTMLFormElement)
    expect(await screen.findByRole('button', { name: 'Sync acme/new' })).toBeInTheDocument()
    expect(deps.addRepo).toHaveBeenCalledWith('acme/new')
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
  })

  it('#8 AC12: busy state, singular and plural success texts', async () => {
    let resolve: (r: AddRepoResult) => void = () => {}
    setup({ addRepo: () => new Promise((r) => (resolve = r)) })
    await ready()
    fireEvent.change(field(), { target: { value: 'acme/new' } })
    fireEvent.click(addButton())
    expect(screen.getByText('Adding acme/new…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adding…' })).toHaveAttribute('aria-disabled', 'true')
    resolve({ ok: true, repo: 'acme/new', synced: true, people: 1 })
    await screen.findByText('Added acme/new. 1 person found.')
    cleanup()

    setup({ addRepo: async () => ({ ok: true, repo: 'acme/new', synced: true, people: 5 }) })
    await ready()
    fireEvent.change(field(), { target: { value: 'acme/new' } })
    fireEvent.click(addButton())
    await screen.findByText('Added acme/new. 5 people found.')
  })

  it('#8 AC12: added but the first sync failed keeps the repo listed', async () => {
    const state = { repos: [] as LinkedRepo[] }
    const { onClose } = setup({
      listRepos: async () => ({ ok: true, repos: state.repos }),
      addRepo: async () => {
        state.repos = [unsynced('acme/new')]
        return { ok: true, repo: 'acme/new', synced: false }
      },
    })
    await ready()
    fireEvent.change(field(), { target: { value: 'acme/new' } })
    fireEvent.click(addButton())
    await screen.findByText('Added acme/new. The first sync failed; use Sync to try again.')
    expect(await screen.findByText('Not synced yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('#8 AC12: a generic failure shows the generic text and keeps the input', async () => {
    setup({ addRepo: async () => ({ ok: false, error: 'request_failed' }) })
    await ready()
    fireEvent.change(field(), { target: { value: 'acme/new' } })
    fireEvent.click(addButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Could not add the repository. Check that the local server is running, then try again.',
    )
    expect(field()).toHaveValue('acme/new')
  })

  it('#8 AC3: distinct inline errors with aria-invalid, input kept', async () => {
    const cases: [AddRepoResult, string][] = [
      [{ ok: false, error: 'invalid_format' }, 'Use the owner/repo format'],
      [{ ok: false, error: 'duplicate', repo: 'acme/api' }, 'acme/api is already added'],
      [{ ok: false, error: 'not_found_or_no_access' }, 'Not found, or the token cannot read it'],
      [
        { ok: false, error: 'missing_token' },
        'No token configured. Set GITHUB_TOKEN in .env and restart the server.',
      ],
    ]
    const seen = new Set<string>()
    for (const [result, text] of cases) {
      setup({ addRepo: async () => result })
      await ready()
      fireEvent.change(field(), { target: { value: 'ACME/API' } })
      fireEvent.click(addButton())
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(text)
      seen.add(text)
      expect(field()).toHaveAttribute('aria-invalid', 'true')
      expect(field().getAttribute('aria-describedby')).toContain(alert.id)
      expect(field()).toHaveValue('ACME/API')
      cleanup()
    }
    expect(seen.size).toBe(4)
  })

  it('#8 AC4: confirm, then the row disappears and Removed is shown', async () => {
    const { deps, onClose } = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    expect(
      screen.getByText(
        'Stop reading acme/api? This only stops this app from reading it and deletes its local data. Nothing is deleted on GitHub.',
      ),
    ).toBeInTheDocument()
    expect(deps.removeRepo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    await screen.findByText('Removed acme/api.')
    expect(screen.queryByText('acme/api')).toBeNull()
    expect(deps.removeRepo).toHaveBeenCalledWith('acme/api')
    // Focus moves to the next row's Remove.
    expect(screen.getByRole('button', { name: 'Remove acme/web' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('#8 AC4: removing the last row moves focus to the field', async () => {
    setup({ repos: [synced('acme/api')] })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    await screen.findByText('Removed acme/api.')
    expect(field()).toHaveFocus()
  })

  it('#8 AC4: Cancel restores the row and focuses its Remove', async () => {
    const { deps } = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove acme/api' })).toHaveFocus()
    expect(deps.removeRepo).not.toHaveBeenCalled()
  })

  it('#8 AC4: Esc cancels an open confirm before closing the modal', async () => {
    const { onClose } = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove acme/api' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove acme/api' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('#8 AC4: a failed remove restores the row with an error', async () => {
    const { onClose } = setup({ removeRepo: async () => ({ ok: false }) })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme/api' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    await screen.findByText('Could not remove acme/api. Try again.')
    expect(screen.getByRole('button', { name: 'Remove acme/api' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('#8 AC5: Syncing shows on one row while the others stay usable', async () => {
    let resolve: (r: SyncResult) => void = () => {}
    const { deps } = setup({
      syncRepo: (repo) => (repo === 'acme/api' ? new Promise((r) => (resolve = r)) : Promise.resolve({ ok: true, people: 1 })),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Sync acme/api' }))
    expect(screen.getByRole('button', { name: 'Sync acme/api' })).toHaveTextContent('Syncing…')
    const other = screen.getByRole('button', { name: 'Sync acme/web' })
    expect(other).toHaveTextContent('Sync')
    expect(other).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(other)
    await screen.findByText('Synced just now. 1 person found.')
    resolve({ ok: true, people: 4 })
    await screen.findByText('Synced just now. 4 people found.')
    expect(deps.listRepos.mock.calls.length).toBeGreaterThan(1)
  })

  it('#8 AC5: a failed sync shows fixed text, never the server message', async () => {
    setup({
      syncRepo: async () => ({ ok: false, code: 'github_failed', message: `bad credentials ${FAKE_TOKEN}` }),
    })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Sync acme/api' }))
    await screen.findByText('Sync failed. Try again.')
    expect(document.body.textContent).not.toContain(FAKE_TOKEN)
  })

  it('#8 AC7: no token-like field and nothing written to web storage', async () => {
    setup()
    await ready()
    fireEvent.change(field(), { target: { value: 'acme/new' } })
    fireEvent.click(addButton())
    await screen.findByText('Added acme/new. 2 people found.')
    const dialog = screen.getByRole('dialog')
    const inputs = within(dialog).getAllByRole('textbox')
    expect(inputs).toHaveLength(1)
    expect(dialog.querySelector('input[type="password"]')).toBeNull()
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })

  it('#8 AC6: row actions have unique accessible names', async () => {
    setup()
    await ready()
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
      .filter((n) => /^(Sync|Remove) /.test(n))
    expect(names).toEqual(['Sync acme/api', 'Remove acme/api', 'Sync acme/web', 'Remove acme/web'])
    expect(new Set(names).size).toBe(names.length)
  })
})
