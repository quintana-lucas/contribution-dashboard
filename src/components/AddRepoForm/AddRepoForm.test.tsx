import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AddRepoForm from './AddRepoForm'

afterEach(cleanup)

describe('AddRepoForm', () => {
  it('#8 AC3: an empty submit shows the format error without calling the server', () => {
    const addRepo = vi.fn()
    render(<AddRepoForm ref={createRef()} addRepo={addRepo} onAdded={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use the owner/repo format')
    expect(addRepo).not.toHaveBeenCalled()
  })

  it('#8 AC2: Enter submits and success clears and focuses the field', async () => {
    const onAdded = vi.fn()
    const addRepo = vi.fn(async () => ({ ok: true as const, repo: 'a/b', synced: true as const, people: 2 }))
    render(<AddRepoForm ref={createRef()} addRepo={addRepo} onAdded={onAdded} />)
    const input = screen.getByLabelText('Repository')
    fireEvent.change(input, { target: { value: 'a/b' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await screen.findByText('Added a/b. 2 people found.')
    expect(onAdded).toHaveBeenCalledTimes(1)
  })
})
