import { useEffect, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { mockElementRect, mockResizeObserver, renderChart } from './chart'

function Measured() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} data-testid="box">{width}</div>
}

describe('chart test helpers', () => {
  it('AC5: mockResizeObserver reports the given size and restores the global', () => {
    const before = globalThis.ResizeObserver
    const restore = mockResizeObserver({ width: 321, height: 100 })
    expect(globalThis.ResizeObserver).not.toBe(before)
    let seen: ResizeObserverEntry | undefined
    const target = document.createElement('div')
    new ResizeObserver(([entry]) => {
      seen = entry
    }).observe(target)
    expect(seen?.contentRect.width).toBe(321)
    expect(seen?.contentRect.height).toBe(100)
    expect(seen?.target).toBe(target)
    restore()
    expect(globalThis.ResizeObserver).toBe(before)
  })

  it('AC5: mockElementRect fixes getBoundingClientRect and restores it', () => {
    const el = document.createElement('div')
    const restore = mockElementRect({ left: 10, top: 20, width: 100, height: 50 })
    const rect = el.getBoundingClientRect()
    expect(rect.right).toBe(110)
    expect(rect.bottom).toBe(70)
    expect(rect.width).toBe(100)
    restore()
    expect(el.getBoundingClientRect().width).toBe(0)
  })

  it('AC5: renderChart renders a component that depends on ResizeObserver in jsdom', () => {
    const before = globalThis.ResizeObserver
    const { unmount } = renderChart(<Measured />, { width: 480, height: 200 })
    expect(screen.getByTestId('box')).toHaveTextContent('480')
    unmount()
    expect(globalThis.ResizeObserver).toBe(before)
  })
})
