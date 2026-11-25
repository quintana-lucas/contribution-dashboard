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

  it('#67 AC1: does not render a Profile or coming-soon placeholder', () => {
    render(<Header onOpenSettings={() => {}} />)
    expect(screen.queryByText(/profile/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', {
        name: 'Placeholder for future header controls',
      }),
    ).not.toBeInTheDocument()
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

  it('#143 AC4: the actions slot renders before Settings and the theme toggle', () => {
    render(<Header onOpenSettings={() => {}} actions={<button type="button">Sync now</button>} />)
    const sync = screen.getByRole('button', { name: 'Sync now' })
    const settings = screen.getByRole('button', { name: 'Open settings' })
    const toggle = screen.getByRole('button', { name: 'Dark theme' })
    expect(sync.nextElementSibling).toBe(settings)
    expect(settings.nextElementSibling).toBe(toggle)
  })

  it('#143 AC4: renders without an actions slot', () => {
    render(<Header onOpenSettings={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('#79 AC1: renders the theme toggle right after the Settings button', () => {
    render(<Header onOpenSettings={() => {}} />)
    const settings = screen.getByRole('button', { name: 'Open settings' })
    const toggle = screen.getByRole('button', { name: 'Dark theme' })
    expect(settings.nextElementSibling).toBe(toggle)
  })
})
