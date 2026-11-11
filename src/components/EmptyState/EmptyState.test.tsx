import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('#15 AC5: without a synced repo step 2 stays inactive text', () => {
    render(<EmptyState onAddRepositories={() => {}} canChooseTeam={false} onChooseTeam={() => {}} />)
    expect(screen.queryByRole('button', { name: /Choose your team/ })).toBeNull()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('#15 AC5 AC7: with a synced repo step 2 is a labeled button that calls onChooseTeam', () => {
    const onChoose = vi.fn()
    render(<EmptyState onAddRepositories={() => {}} canChooseTeam onChooseTeam={onChoose} />)
    const button = screen.getByRole('button', { name: 'Choose your team: open team settings' })
    expect(screen.queryByText('Coming soon')).toBeNull()
    expect(screen.getByText('Pick the people to follow across those repositories.')).toBeInTheDocument()
    fireEvent.click(button)
    expect(onChoose).toHaveBeenCalledTimes(1)
  })

  it('#15 AC5: a synced repo with the team never chosen shows the empty state, and choosing opens Team members', async () => {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [{ login: 'ana', pullRequests: 1, reviews: 0, repos: ['acme/api'] }],
      selected: null,
      added: [],
    }))
    render(<App {...deps} />)
    expect(await screen.findByText('Set up your dashboard')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose your team: open team settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(dialog).getByRole('tab', { name: 'Team members' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(dialog).findByRole('checkbox', { name: 'ana' })).toBeChecked()
  })

  it('#15 AC5: with no synced repo step 2 is inactive in the app', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({
        ok: true as const,
        repos: [{ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null }],
      })),
      getTeam: vi.fn(async () => ({ ok: true as const, candidates: [], selected: null, added: [] })),
    }
    render(<App {...deps} />)
    await screen.findByText('Set up your dashboard')
    expect(screen.queryByRole('button', { name: /Choose your team/ })).toBeNull()
  })

  it('#15 AC7: closing Settings without a change returns focus to the step 2 button', async () => {
    const deps = makeDeps()
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      selected: null,
      added: [],
    }))
    render(<App {...deps} />)
    await screen.findByText('Set up your dashboard')
    const step = screen.getByRole('button', { name: 'Choose your team: open team settings' })
    step.focus()
    fireEvent.click(step)
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText(/No team members to choose from yet/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose your team: open team settings' })).toHaveFocus())
  })

  it('#15 AC5: choosing the team in Settings and closing shows the dashboard, focus on Header Settings', async () => {
    const deps = makeDeps()
    let selected: string[] | null = null
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [{ login: 'ana', pullRequests: 1, reviews: 0, repos: ['acme/api'] }],
      selected,
      added: [],
    }))
    deps.saveTeam.mockImplementation(async (team) => {
      selected = team.selected
      return { ok: true }
    })
    render(<App {...deps} />)
    await screen.findByText('Set up your dashboard')
    const step = screen.getByRole('button', { name: 'Choose your team: open team settings' })
    step.focus()
    fireEvent.click(step)
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByRole('checkbox', { name: 'ana' })
    await waitFor(() => expect(deps.saveTeam).toHaveBeenCalledTimes(1))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(screen.queryByText('Set up your dashboard')).toBeNull())
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open settings' })).toHaveFocus())
  })

  it('#15 AC5: a synced repo with no activity: adding a login in Settings and closing shows the dashboard', async () => {
    const deps = makeDeps()
    let team: { selected: string[] | null; added: string[] } = { selected: null, added: [] }
    deps.getTeam.mockImplementation(async () => ({
      ok: true as const,
      candidates: [],
      anySynced: true,
      ...team,
    }))
    deps.saveTeam.mockImplementation(async (next) => {
      team = next
      return { ok: true }
    })
    render(<App {...deps} />)
    await screen.findByText('Set up your dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Choose your team: open team settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText(/No activity in the last 90 days/)
    expect(deps.saveTeam).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('GitHub login'), { target: { value: 'zoe' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(deps.saveTeam).toHaveBeenCalledWith({ selected: ['zoe'], added: ['zoe'] }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(screen.queryByText('Set up your dashboard')).toBeNull())
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument()
  })

  it('#8 AC1: with an empty list there is no toolbar and the empty state shows', async () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })) }
    render(<App {...deps} />)
    expect(await screen.findByText('Set up your dashboard')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Dashboard filters' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
