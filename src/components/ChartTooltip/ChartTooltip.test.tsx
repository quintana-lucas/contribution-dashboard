import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChartTooltip, { clampToViewport, useChartTooltip, HOVER_DELAY_MS } from '.'
import { mockElementRect } from '../../test/chart'

const ROWS = [
  { color: 'var(--color-bar-muted)', name: 'Approved', value: 3 },
  { color: 'var(--color-text)', name: 'Commented', value: 0 },
]

function Harness() {
  const { open, bind } = useChartTooltip<string>()
  return (
    <div>
      <button {...bind('Alice')}>row</button>
      <button>elsewhere</button>
      {open && <ChartTooltip anchor={open.anchor} title={open.data} rows={ROWS} />}
    </div>
  )
}

describe('clampToViewport', () => {
  const viewport = { width: 400, height: 300 }
  const size = { width: 100, height: 50 }

  it('AC3: centers the tooltip above the anchor', () => {
    const pos = clampToViewport({ left: 150, top: 200, width: 20, height: 10 }, size, viewport)
    expect(pos).toEqual({ left: 110, top: 142 })
  })

  it('AC3: flips below when there is no room above', () => {
    const pos = clampToViewport({ left: 150, top: 10, width: 20, height: 10 }, size, viewport)
    expect(pos.top).toBe(28)
  })

  it('AC3: stays inside the viewport horizontally', () => {
    expect(clampToViewport({ left: 0, top: 200, width: 10, height: 10 }, size, viewport).left).toBe(0)
    expect(clampToViewport({ left: 395, top: 200, width: 10, height: 10 }, size, viewport).left).toBe(300)
  })

  it('AC3: stays inside the viewport vertically', () => {
    const pos = clampToViewport({ left: 100, top: 280, width: 10, height: 30 }, size, viewport)
    expect(pos.top).toBeLessThanOrEqual(250)
  })
})

describe('ChartTooltip', () => {
  it('AC3: renders title, one row per series with zeros, and a footer', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    render(<ChartTooltip anchor={anchor} title="Alice" rows={ROWS} footer="6 total" />)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Alice')
    expect(tip.querySelectorAll('li')).toHaveLength(2)
    expect(tip).toHaveTextContent('Approved')
    expect(tip).toHaveTextContent('Commented')
    expect(tip.querySelectorAll('li')[1]).toHaveTextContent('0')
    expect(tip).toHaveTextContent('6 total')
    anchor.remove()
  })

  it('AC3: omits the footer when none is given', () => {
    const anchor = document.createElement('button')
    render(<ChartTooltip anchor={anchor} title="Alice" rows={ROWS} />)
    expect(screen.getByRole('tooltip').querySelectorAll('p')).toHaveLength(1)
  })

  it('AC3: renders in a portal outside the chart container', () => {
    const anchor = document.createElement('button')
    const { container } = render(<ChartTooltip anchor={anchor} title="Alice" rows={ROWS} />)
    expect(container).not.toContainElement(screen.getByRole('tooltip'))
  })

  it('AC3: is positioned inside the viewport', () => {
    const restore = mockElementRect({ left: 0, top: 0, width: 50, height: 20 })
    try {
      const anchor = document.createElement('button')
      render(<ChartTooltip anchor={anchor} title="Alice" rows={ROWS} />)
      const style = screen.getByRole('tooltip').style
      expect(parseFloat(style.left)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(style.top)).toBeGreaterThanOrEqual(0)
      expect(style.visibility).toBe('visible')
    } finally {
      restore()
    }
  })
})

describe('useChartTooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('AC3: opens on hover after the delay and closes on leave', () => {
    render(<Harness />)
    const row = screen.getByText('row')
    fireEvent.mouseEnter(row)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Alice')
    fireEvent.mouseLeave(row)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('AC3: leaving before the delay never opens it', () => {
    render(<Harness />)
    const row = screen.getByText('row')
    fireEvent.mouseEnter(row)
    fireEvent.mouseLeave(row)
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS * 2)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('AC3: opens on focus immediately and closes on blur', () => {
    render(<Harness />)
    const row = screen.getByText('row')
    fireEvent.focus(row)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.blur(row)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('AC3: Escape closes the tooltip', () => {
    render(<Harness />)
    const row = screen.getByText('row')
    fireEvent.focus(row)
    fireEvent.keyDown(row, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('AC3: a touch opens it and a touch elsewhere closes it', () => {
    render(<Harness />)
    fireEvent.touchStart(screen.getByText('row'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.touchStart(screen.getByText('elsewhere'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('AC3: a touch on the anchor itself keeps it open', () => {
    render(<Harness />)
    const row = screen.getByText('row')
    fireEvent.touchStart(row)
    fireEvent.touchStart(row)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
