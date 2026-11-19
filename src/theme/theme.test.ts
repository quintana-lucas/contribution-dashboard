import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from './theme'

function stubSystem(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: dark && query.includes('dark'), media: query })),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('theme', () => {
  it('AC3: with nothing stored, resolves to the OS theme (dark)', () => {
    stubSystem(true)
    expect(resolveTheme()).toBe('dark')
  })

  it('AC3: with nothing stored, resolves to the OS theme (light)', () => {
    stubSystem(false)
    expect(resolveTheme()).toBe('light')
  })

  it('AC3: treats a missing matchMedia as light', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(getSystemTheme()).toBe('light')
    expect(resolveTheme()).toBe('light')
  })

  it('AC4: returns the stored value', () => {
    storeTheme('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredTheme()).toBe('dark')
    storeTheme('light')
    expect(readStoredTheme()).toBe('light')
  })

  it('AC4: ignores invalid stored values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readStoredTheme()).toBeNull()
  })

  it('AC6: reads return null when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    stubSystem(true)
    expect(readStoredTheme()).toBeNull()
    expect(resolveTheme()).toBe('dark')
  })

  it('AC6: writes are swallowed when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => storeTheme('dark')).not.toThrow()
  })

  it('AC7: an explicit light choice beats a dark OS', () => {
    stubSystem(true)
    storeTheme('light')
    expect(resolveTheme()).toBe('light')
  })

  it('AC7: an explicit dark choice beats a light OS', () => {
    stubSystem(false)
    storeTheme('dark')
    expect(resolveTheme()).toBe('dark')
  })

  it('AC7: applyTheme sets data-theme on the root element', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
