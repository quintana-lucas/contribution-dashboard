import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWidth } from './useWidth.ts'

function Probe() {
  const [ref, width] = useWidth<HTMLDivElement>(123)
  return (
    <div ref={ref} data-testid="probe">
      {width}
    </div>
  )
}

describe('useWidth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the fallback when no width can be measured', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('123')
  })

  it('updates when the observed element resizes', () => {
    let cb: ResizeObserverCallback = () => {}
    class FakeRO {
      constructor(c: ResizeObserverCallback) {
        cb = c
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeRO)
    render(<Probe />)
    act(() => {
      cb([{ contentRect: { width: 250 } } as ResizeObserverEntry], {} as ResizeObserver)
    })
    expect(screen.getByTestId('probe').textContent).toBe('250')
  })
})
