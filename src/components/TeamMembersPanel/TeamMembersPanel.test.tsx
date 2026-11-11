import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GetTeamResult } from '../../api/client'
import type { Candidate } from '../../api/team'
import TeamMembersPanel from './TeamMembersPanel'

const ana: Candidate = { login: 'ana', pullRequests: 3, reviews: 1, repos: ['acme/api', 'acme/web'] }
const bob: Candidate = { login: 'bob', pullRequests: 1, reviews: 2, repos: ['acme/api'] }
const cy: Candidate = { login: 'cy', pullRequests: 0, reviews: 1, repos: ['acme/web'] }

function setup(
  team: { candidates?: Candidate[]; selected?: string[] | null; added?: string[]; anySynced?: boolean } = {},
  saveResults: boolean[] = [],
) {
  const onChanged = vi.fn()
  const getTeam = vi.fn(
    async (): Promise<GetTeamResult> => ({
      ok: true,
      candidates: team.candidates ?? [ana, bob],
      selected: team.selected === undefined ? ['ana', 'bob'] : team.selected,
      added: team.added ?? [],
      anySynced: team.anySynced,
    }),
  )
  const queue = [...saveResults]
  const saveTeam = vi.fn(async () => ({ ok: queue.length ? (queue.shift() as boolean) : true }))
  render(<TeamMembersPanel getTeam={getTeam} saveTeam={saveTeam} onChanged={onChanged} />)
  return { getTeam, saveTeam, onChanged }
}

const ready = () => screen.findByRole('list', { name: 'Team members' })
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const field = () => screen.getByLabelText('GitHub login')
const add = () => screen.getByRole('button', { name: 'Add' })

afterEach(cleanup)

describe('TeamMembersPanel save ordering', () => {
  const deferred = () => {
    let resolve: (r: { ok: boolean }) => void = () => {}
    const promise = new Promise<{ ok: boolean }>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('#15 AC4: fast toggles save one at a time in order, and the stored team ends correct', async () => {
    const stored: { selected: string[] }[] = []
    const gates: ReturnType<typeof deferred>[] = []
    const saveTeam = vi.fn(async (team: { selected: string[]; added: string[] }) => {
      const gate = deferred()
      gates.push(gate)
      const res = await gate.promise
      if (res.ok) stored.push({ selected: team.selected })
      return res
    })
    const getTeam = vi.fn(
      async (): Promise<GetTeamResult> => ({ ok: true, candidates: [ana, bob], selected: ['ana', 'bob'], added: [] }),
    )
    render(<TeamMembersPanel getTeam={getTeam} saveTeam={saveTeam} onChanged={() => {}} />)
    await ready()
    fireEvent.click(box('ana'))
    fireEvent.click(box('bob'))
    // The second toggle is applied at once, but its save waits for the first.
    expect(box('ana')).not.toBeChecked()
    expect(box('bob')).not.toBeChecked()
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(1))
    // Resolve the first save only after the second toggle was issued.
    gates[0].resolve({ ok: true })
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(2))
    gates[1].resolve({ ok: true })
    await waitFor(() => expect(stored).toHaveLength(2))
    expect(stored[stored.length - 1].selected).toEqual([])
    expect(box('ana')).not.toBeChecked()
    expect(box('bob')).not.toBeChecked()
  })

  it('#15 AC4: a failed save rolls back to the last saved team, not a stale one', async () => {
    const gates: ReturnType<typeof deferred>[] = []
    const saveTeam = vi.fn(async (_team: { selected: string[]; added: string[] }) => {
      const gate = deferred()
      gates.push(gate)
      return gate.promise
    })
    const getTeam = vi.fn(
      async (): Promise<GetTeamResult> => ({ ok: true, candidates: [ana, bob], selected: ['ana', 'bob'], added: [] }),
    )
    render(<TeamMembersPanel getTeam={getTeam} saveTeam={saveTeam} onChanged={() => {}} />)
    await ready()
    fireEvent.click(box('ana'))
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(1))
    gates[0].resolve({ ok: true })
    fireEvent.click(box('bob'))
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(2))
    gates[1].resolve({ ok: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the selection. Try again.')
    // Back to the last saved team: ana off (saved), bob on.
    expect(box('ana')).not.toBeChecked()
    expect(box('bob')).toBeChecked()
  })

  it('#15 AC4: first setup saves exactly once under StrictMode', async () => {
    const saveTeam = vi.fn(async (_team: { selected: string[]; added: string[] }) => ({ ok: true }))
    const getTeam = vi.fn(
      async (): Promise<GetTeamResult> => ({ ok: true, candidates: [ana, bob], selected: null, added: [] }),
    )
    render(
      <StrictMode>
        <TeamMembersPanel getTeam={getTeam} saveTeam={saveTeam} onChanged={() => {}} />
      </StrictMode>,
    )
    await ready()
    await waitFor(() => expect(saveTeam).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(saveTeam).toHaveBeenCalledTimes(1)
    expect(saveTeam).toHaveBeenCalledWith({ selected: ['ana', 'bob'], added: [] })
  })
})

describe('TeamMembersPanel', () => {
  it('#15 AC1: loading text, then rows with login, counts and repos', async () => {
    setup({ candidates: [ana, bob, cy] })
    expect(screen.getByText('Loading team members...')).toBeInTheDocument()
    await ready()
    expect(box('ana')).toHaveAccessibleDescription('3 pull requests, 1 review, acme/api, acme/web')
    expect(box('bob')).toHaveAccessibleDescription('1 pull request, 2 reviews, acme/api')
    expect(box('cy')).toHaveAccessibleDescription('0 pull requests, 1 review, acme/web')
  })

  it('#15 AC1: load error with Retry', async () => {
    let fail = true
    const getTeam = vi.fn(async (): Promise<GetTeamResult> =>
      fail ? { ok: false } : { ok: true, candidates: [ana], selected: ['ana'], added: [] },
    )
    render(<TeamMembersPanel getTeam={getTeam} saveTeam={async () => ({ ok: true })} onChanged={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load team members. Check that the local server is running, then try again.',
    )
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await ready()
  })

  it('#15 AC6: empty state has the message and no add form', async () => {
    setup({ candidates: [], selected: null })
    await screen.findByText('No team members to choose from yet. Sync a repository first, then come back here.')
    expect(screen.queryByLabelText('GitHub login')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('#15 AC6: nothing synced keeps the empty message and no form even when anySynced is false', async () => {
    setup({ candidates: [], selected: null, anySynced: false })
    await screen.findByText('No team members to choose from yet. Sync a repository first, then come back here.')
    expect(screen.queryByLabelText('GitHub login')).toBeNull()
  })

  it('#15 AC3 AC6: a synced repo with no activity shows the new copy and the form, and adding saves', async () => {
    const { saveTeam, onChanged } = setup({ candidates: [], selected: null, anySynced: true })
    await screen.findByText('No activity in the last 90 days. Add team members by GitHub login below.')
    expect(screen.queryByRole('list', { name: 'Team members' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Select all team members' })).toBeNull()
    expect(saveTeam).not.toHaveBeenCalled()
    fireEvent.change(field(), { target: { value: '@Zoe' } })
    fireEvent.click(add())
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(1))
    expect(saveTeam).toHaveBeenCalledWith({ selected: ['Zoe'], added: ['Zoe'] })
    await ready()
    expect(box('Zoe')).toBeChecked()
    expect(box('Zoe')).toHaveAccessibleDescription('No activity yet')
    expect(screen.getByText('1 of 1 selected')).toBeInTheDocument()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('#15 AC1: hand-added logins are listed even with zero candidates', async () => {
    setup({ candidates: [], selected: ['zoe'], added: ['zoe', 'kai'], anySynced: true })
    await ready()
    expect(box('zoe')).toBeChecked()
    expect(box('kai')).not.toBeChecked()
    expect(box('kai')).toHaveAccessibleDescription('No activity yet')
    expect(screen.queryByText(/No activity in the last 90 days/)).toBeNull()
  })

  it('#15 AC2: first setup checks everyone and saves once', async () => {
    const { saveTeam, onChanged } = setup({ selected: null })
    await ready()
    expect(box('ana')).toBeChecked()
    expect(box('bob')).toBeChecked()
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    await waitFor(() => expect(saveTeam).toHaveBeenCalledTimes(1))
    expect(saveTeam).toHaveBeenCalledWith({ selected: ['ana', 'bob'], added: [] })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('#15 AC2: a failed first-setup save shows the save error', async () => {
    setup({ selected: null }, [false])
    expect(await screen.findByText('Could not save the selection. Try again.')).toBeInTheDocument()
  })

  it('#15 AC2: a saved selection is respected without saving on open', async () => {
    const { saveTeam } = setup({ selected: ['bob'] })
    await ready()
    expect(box('ana')).not.toBeChecked()
    expect(box('bob')).toBeChecked()
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    expect(saveTeam).not.toHaveBeenCalled()
  })

  it('#15 AC2: toggle autosaves and calls onChanged', async () => {
    const { saveTeam, onChanged } = setup()
    await ready()
    fireEvent.click(box('ana'))
    expect(box('ana')).not.toBeChecked()
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    await waitFor(() => expect(saveTeam).toHaveBeenLastCalledWith({ selected: ['bob'], added: [] }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    fireEvent.click(box('ana'))
    await waitFor(() => expect(saveTeam).toHaveBeenLastCalledWith({ selected: ['bob', 'ana'], added: [] }))
  })

  it('#15 AC2: Clear then Select all, zero selected allowed, focus stays', async () => {
    const { saveTeam } = setup()
    await ready()
    const clear = screen.getByRole('button', { name: 'Clear team selection' })
    clear.focus()
    fireEvent.click(clear)
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
    await waitFor(() => expect(saveTeam).toHaveBeenLastCalledWith({ selected: [], added: [] }))
    expect(clear).toHaveFocus()
    const all = screen.getByRole('button', { name: 'Select all team members' })
    all.focus()
    fireEvent.click(all)
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    await waitFor(() => expect(saveTeam).toHaveBeenLastCalledWith({ selected: ['ana', 'bob'], added: [] }))
    expect(all).toHaveFocus()
  })

  it('#15 AC2: a failed save rolls back and shows the error', async () => {
    const { onChanged } = setup({}, [false])
    await ready()
    fireEvent.click(box('ana'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the selection. Try again.')
    expect(box('ana')).toBeChecked()
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('#15 AC3: a valid new login is added, selected, saved, field cleared and focused', async () => {
    const { saveTeam } = setup()
    await ready()
    fireEvent.change(field(), { target: { value: ' @Zoe-1 ' } })
    fireEvent.submit(field().closest('form') as HTMLFormElement)
    expect(await screen.findByText('Added Zoe-1.')).toBeInTheDocument()
    expect(saveTeam).toHaveBeenLastCalledWith({ selected: ['ana', 'bob', 'Zoe-1'], added: ['Zoe-1'] })
    expect(box('Zoe-1')).toBeChecked()
    expect(box('Zoe-1')).toHaveAccessibleDescription('No activity yet')
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
  })

  it('#15 AC3: empty and malformed logins show inline errors and add nothing', async () => {
    const { saveTeam } = setup()
    await ready()
    fireEvent.click(add())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Enter a GitHub login')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field().getAttribute('aria-describedby')).toContain(alert.id)
    fireEvent.change(field(), { target: { value: 'dependabot[bot]' } })
    fireEvent.click(add())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not a valid GitHub login. Use letters, numbers and single hyphens, up to 39 characters.',
    )
    expect(field()).toHaveValue('dependabot[bot]')
    expect(saveTeam).not.toHaveBeenCalled()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('#15 AC3: a duplicate login is selected and reported as already listed', async () => {
    const { saveTeam } = setup({ selected: ['bob'] })
    await ready()
    fireEvent.change(field(), { target: { value: 'ANA' } })
    fireEvent.click(add())
    expect(await screen.findByText('ana is already in the list.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(saveTeam).toHaveBeenLastCalledWith({ selected: ['bob', 'ana'], added: [] })
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(box('ana')).toBeChecked()
  })

  it('#15 AC3: hand-added logins from the server are listed, a failed add rolls back', async () => {
    setup({ added: ['zoe'], selected: ['ana', 'zoe'] }, [false])
    await ready()
    expect(box('zoe')).toBeChecked()
    fireEvent.change(field(), { target: { value: 'newbie' } })
    fireEvent.click(add())
    expect(await screen.findByText('Could not save the selection. Try again.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'newbie' })).toBeNull()
    expect(field()).toHaveValue('newbie')
  })

  it('#15 AC7: controls are labeled and tab order is bulk buttons, rows, field, Add', async () => {
    setup()
    await ready()
    const root = screen.getByRole('list', { name: 'Team members' }).parentElement as HTMLElement
    const order = Array.from(root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button, input')).map(
      (el) => el.getAttribute('aria-label') ?? el.labels?.[0]?.textContent ?? el.textContent,
    )
    expect(order).toEqual(['Select all team members', 'Clear team selection', 'ana', 'bob', 'GitHub login', 'Add'])
    expect(field()).toHaveAttribute('placeholder', 'login')
    expect(
      screen.getByText('Add someone with no activity yet. Letters, numbers and hyphens only.'),
    ).toBeInTheDocument()
  })

  it('#15 AC8: only logins are rendered, no avatars, names or emails', async () => {
    setup()
    await ready()
    const list = within(screen.getByRole('list', { name: 'Team members' }))
    expect(list.queryAllByRole('img')).toHaveLength(0)
    expect(document.querySelector('img')).toBeNull()
    expect(list.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['ana', 'bob'])
    expect(document.body.textContent).not.toMatch(/@\w+\.\w+/)
  })
})
