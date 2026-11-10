import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('AC8: renders the banner landmark', () => {
    render(<Header onOpenSettings={() => {}} />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('AC2: renders the product name as the h1', () => {
    render(<Header onOpenSettings={() => {}} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Contribution Dashboard' }),
    ).toBeInTheDocument()
  })

  it('AC2: renders the non-focusable profile slot', () => {
    render(<Header onOpenSettings={() => {}} />)
    const slot = screen.getByRole('group', {
      name: 'Placeholder for future header controls',
    })
    expect(slot).toHaveTextContent('Profile (coming soon)')
    expect(slot).not.toHaveAttribute('tabindex')
  })

  it('#8 AC1: the Settings button calls onOpenSettings and forwards its ref', () => {
    const onOpenSettings = vi.fn()
    const ref = { current: null as HTMLButtonElement | null }
    render(<Header onOpenSettings={onOpenSettings} settingsRef={ref} />)
    const button = screen.getByRole('button', { name: 'Open settings' })
    expect(button).toHaveTextContent('Settings')
    expect(ref.current).toBe(button)
    fireEvent.click(button)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
