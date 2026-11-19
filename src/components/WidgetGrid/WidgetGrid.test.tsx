import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDeps } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import WidgetGrid from './WidgetGrid'

const names = [
  'Merged PRs per person',
  'Reviews given per person',
  'PRs opened, merged and closed',
  'Open PRs waiting for review',
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
    vi.unstubAllGlobals()
  })

  it('AC7: renders four regions in order: merged PRs, reviews, PR activity, waiting', () => {
    renderGrid()
    const regions = screen.getAllByRole('region')
    expect(regions).toHaveLength(4)
    names.forEach((name, i) => {
      expect(regions[i]).toBe(screen.getByRole('region', { name }))
    })
  })

  it('#69 AC3: region names are the four approved titles, distinct and not generic', () => {
    renderGrid()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(names)
    expect(new Set(titles).size).toBe(4)
    titles.forEach((title) => expect(title).not.toMatch(/^Widget \d/))
  })

  it('AC6: widget 2 is the reviews widget, not a placeholder', () => {
    renderGrid()
    const region = screen.getByRole('region', { name: 'Reviews given per person' })
    expect(region).toHaveTextContent('Reviews given per person')
    expect(region).not.toHaveTextContent('Placeholder. No data yet.')
  })

  it('AC7: widget 3 is the PR activity widget, not a placeholder', () => {
    renderGrid()
    const region = screen.getByRole('region', { name: 'PRs opened, merged and closed' })
    expect(region).toHaveTextContent('Pull request activity')
    expect(region).not.toHaveTextContent('Placeholder. No data yet.')
  })

  it('AC5: widget 4 is the waiting widget, not a placeholder', () => {
    renderGrid()
    const region = screen.getByRole('region', { name: 'Open PRs waiting for review' })
    expect(region).toHaveTextContent('overdue after')
    expect(region).not.toHaveTextContent('Placeholder. No data yet.')
  })

  it('AC7: widget 1 no longer shows the placeholder', () => {
    renderGrid()
    const region = screen.getByRole('region', { name: 'Merged PRs per person' })
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
  })
})
