import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RepoRow from './RepoRow'

const NOW = new Date('2026-11-10T12:00:00Z')

afterEach(cleanup)

describe('RepoRow', () => {
  it('#8 AC10: details text for synced and never-synced repos', () => {
    const synced = { repo: 'a/b', syncedAt: '2026-11-10T11:55:00Z', baseBranch: 'main', people: 1 }
    const noop = () => {}
    const row = (repo: typeof synced | { repo: string; syncedAt: null; baseBranch: null; people: null }) => (
      <ul>
        <RepoRow repo={repo} now={NOW} syncRepo={vi.fn()} removeRepo={vi.fn()} onSynced={noop} onRemoved={noop} />
      </ul>
    )
    const { unmount } = render(row(synced))
    expect(screen.getByText('Base branch main · 1 person · synced 5 min ago')).toBeInTheDocument()
    unmount()
    render(row({ repo: 'a/b', syncedAt: null, baseBranch: null, people: null }))
    expect(screen.getByText('Not synced yet')).toBeInTheDocument()
  })

  it('#8 AC6: actions are named after the repo', () => {
    render(
      <ul>
        <RepoRow
          repo={{ repo: 'a/b', syncedAt: null, baseBranch: null, people: null }}
          now={NOW}
          syncRepo={vi.fn()}
          removeRepo={vi.fn()}
          onSynced={() => {}}
          onRemoved={() => {}}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Sync a/b' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove a/b' }))
    expect(screen.getByRole('button', { name: 'Remove repository' })).toBeInTheDocument()
  })

  it('#8 AC4: Esc is swallowed while the delete is in flight', () => {
    const outer = vi.fn()
    render(
      <div onKeyDown={outer}>
        <ul>
          <RepoRow
            repo={{ repo: 'a/b', syncedAt: null, baseBranch: null, people: null }}
            now={NOW}
            syncRepo={vi.fn()}
            removeRepo={() => new Promise(() => {})}
            onSynced={() => {}}
            onRemoved={() => {}}
          />
        </ul>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove a/b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }))
    const busy = screen.getByRole('button', { name: 'Removing…' })
    fireEvent.keyDown(busy, { key: 'Escape' })
    expect(outer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeInTheDocument()
  })
})
