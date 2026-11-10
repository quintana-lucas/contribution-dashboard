import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { makeDeps } from '../../test/fakeDeps'
import EmptyState from '.'

describe('EmptyState', () => {
  // Supersedes the #16 placeholder tests.
  it('#8 AC1: shows the two steps, and only the primary button is focusable', () => {
    render(<EmptyState onAddRepositories={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Set up your dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Link the GitHub repositories to read.')).toBeInTheDocument()
    expect(
      screen.getByText('Pick the people to follow across those repositories.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('Choose your team')
    expect(items[1].querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('#8 AC1: the primary button calls onAddRepositories', () => {
    const onAdd = vi.fn()
    render(<EmptyState onAddRepositories={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add repositories' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('#8 AC1: with an empty list there is no toolbar and the empty state shows', async () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })) }
    render(<App {...deps} />)
    expect(await screen.findByText('Set up your dashboard')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Dashboard filters' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
