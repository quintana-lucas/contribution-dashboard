import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { makeDeps } from '../../test/fakeDeps'
import EmptyState from '.'

describe('EmptyState', () => {
  it('#16 AC4: renders the heading and body text', () => {
    render(<EmptyState />)
    expect(screen.getByRole('heading', { name: 'No repositories linked' })).toBeInTheDocument()
    expect(screen.getByText(/Add repositories to \.data\/config\.json/)).toBeInTheDocument()
  })

  it('#16 AC4: with an empty list there is no toolbar and the empty state shows', async () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })) }
    render(<App {...deps} />)
    expect(await screen.findByText('No repositories linked')).toBeInTheDocument()
    expect(screen.getByText(/Add repositories to \.data\/config\.json/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Dashboard filters' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
