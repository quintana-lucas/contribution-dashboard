import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Tabs from './Tabs'

const tabs = [
  { key: 'a', label: 'Alpha', content: <p>Alpha body</p> },
  { key: 'b', label: 'Beta', content: <p>Beta body</p> },
  { key: 'c', label: 'Gamma', content: <p>Gamma body</p> },
]

function setup() {
  render(<Tabs label="Sections" tabs={tabs} />)
  return {
    alpha: screen.getByRole('tab', { name: 'Alpha' }),
    beta: screen.getByRole('tab', { name: 'Beta' }),
    gamma: screen.getByRole('tab', { name: 'Gamma' }),
  }
}

describe('Tabs', () => {
  it('AC2: exposes tablist, tabs and aria-selected', () => {
    const { alpha, beta } = setup()
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(alpha).toHaveAttribute('aria-selected', 'true')
    expect(beta).toHaveAttribute('aria-selected', 'false')
  })

  it('AC2: ties each tab to its panel via aria-controls and aria-labelledby', () => {
    const { alpha, beta } = setup()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels).toHaveLength(3)
    expect(alpha.getAttribute('aria-controls')).toBe(panels[0].id)
    expect(beta.getAttribute('aria-controls')).toBe(panels[1].id)
    expect(panels[0].getAttribute('aria-labelledby')).toBe(alpha.id)
    expect(panels[1].getAttribute('aria-labelledby')).toBe(beta.id)
    expect(screen.getByRole('tabpanel', { name: 'Alpha' })).toBeVisible()
  })

  it('AC2: renders the inactive panels hidden', () => {
    setup()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels[0]).not.toHaveAttribute('hidden')
    expect(panels[1]).toHaveAttribute('hidden')
    expect(panels[2]).toHaveAttribute('hidden')
  })

  it('AC2: only the selected tab has tabindex 0', () => {
    const { alpha, beta, gamma } = setup()
    expect(alpha).toHaveAttribute('tabindex', '0')
    expect(beta).toHaveAttribute('tabindex', '-1')
    expect(gamma).toHaveAttribute('tabindex', '-1')
  })

  it('AC2: arrow keys move focus and selection, wrapping at the ends', () => {
    const { alpha, beta, gamma } = setup()
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowRight' })
    expect(beta).toHaveFocus()
    expect(beta).toHaveAttribute('aria-selected', 'true')
    expect(beta).toHaveAttribute('tabindex', '0')
    expect(alpha).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tabpanel', { name: 'Beta' })).toBeVisible()

    fireEvent.keyDown(beta, { key: 'ArrowLeft' })
    expect(alpha).toHaveFocus()
    fireEvent.keyDown(alpha, { key: 'ArrowLeft' })
    expect(gamma).toHaveFocus()
    expect(gamma).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(gamma, { key: 'ArrowRight' })
    expect(alpha).toHaveFocus()
    expect(alpha).toHaveAttribute('aria-selected', 'true')
  })

  it('AC2: Home and End jump to first and last tab', () => {
    const { alpha, beta, gamma } = setup()
    beta.focus()
    fireEvent.click(beta)
    fireEvent.keyDown(beta, { key: 'End' })
    expect(gamma).toHaveFocus()
    expect(gamma).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(gamma, { key: 'Home' })
    expect(alpha).toHaveFocus()
    expect(alpha).toHaveAttribute('aria-selected', 'true')
  })

  it('AC2: clicking a tab selects it', () => {
    const { beta } = setup()
    fireEvent.click(beta)
    expect(beta).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Beta body')).toBeVisible()
  })

  it('AC2: does not remove the focus ring', () => {
    // Tabs are native buttons (focusable, so the global :focus-visible ring
    // applies) and carry no inline outline override. Tabs.module.css has no
    // `outline` rule at all (checked in review; CSS modules are not
    // loadable as text under vitest).
    const { alpha } = setup()
    alpha.focus()
    expect(alpha.tagName).toBe('BUTTON')
    expect(alpha).toHaveFocus()
    expect(alpha.style.outline).toBe('')
  })
})
