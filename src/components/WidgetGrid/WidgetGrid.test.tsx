import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDeps } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import WidgetGrid from './WidgetGrid'

const names = ['Widget 1', 'Widget 2', 'Widget 3', 'Widget 4']
const placeholders = [
  ['Widget 2', 'Future: reviews'],
  ['Widget 3', 'Future: pull request activity'],
  ['Widget 4', 'Future: to be decided'],
]

function renderGrid() {
  return render(
    <DashboardProvider {...makeDeps()}>
      <WidgetGrid onOpenSettings={() => {}} />
    </DashboardProvider>,
  )
}

describe('WidgetGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC7: renders four regions Widget 1 to 4 in order with unchanged names', () => {
    renderGrid()
    const regions = screen.getAllByRole('region')
    expect(regions).toHaveLength(4)
    names.forEach((name, i) => {
      expect(regions[i]).toBe(screen.getByRole('region', { name }))
    })
  })

  it('AC7: widgets 2 to 4 still show their hint and the placeholder body', () => {
    renderGrid()
    for (const [name, hint] of placeholders) {
      const region = screen.getByRole('region', { name })
      expect(region).toHaveTextContent(hint)
      expect(region).toHaveTextContent('Placeholder. No data yet.')
    }
  })

  it('AC7: widget 1 no longer shows the placeholder', () => {
    renderGrid()
    const region = screen.getByRole('region', { name: 'Widget 1' })
    expect(region).toHaveTextContent('Merged pull requests per person')
    expect(region).not.toHaveTextContent('Placeholder. No data yet.')
  })

  it('AC6: makes no network requests on render', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    renderGrid()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
