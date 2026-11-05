import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WidgetGrid from './WidgetGrid'

const expected = [
  ['Widget 1', 'Future: contributions per person'],
  ['Widget 2', 'Future: reviews'],
  ['Widget 3', 'Future: pull request activity'],
  ['Widget 4', 'Future: to be decided'],
]

describe('WidgetGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC3: renders four regions Widget 1 to 4 in order', () => {
    render(<WidgetGrid />)
    const regions = screen.getAllByRole('region')
    expect(regions).toHaveLength(4)
    expected.forEach(([name], i) => {
      expect(regions[i]).toBe(screen.getByRole('region', { name }))
    })
  })

  it('AC8: each widget shows its hint and the placeholder body', () => {
    render(<WidgetGrid />)
    for (const [name, hint] of expected) {
      const region = screen.getByRole('region', { name })
      expect(region).toHaveTextContent(hint)
      expect(region).toHaveTextContent('Placeholder. No data yet.')
    }
  })

  it('AC7: makes no network requests on render', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    render(<WidgetGrid />)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
