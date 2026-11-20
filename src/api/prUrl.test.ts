import { describe, expect, it } from 'vitest'
import { prUrl } from './prUrl.ts'

describe('prUrl', () => {
  it('AC2: builds the address from repo full name and number', () => {
    expect(prUrl('owner/name', 12)).toBe('https://github.com/owner/name/pull/12')
    expect(prUrl('my-org/repo.js_x', 1)).toBe('https://github.com/my-org/repo.js_x/pull/1')
  })

  it('AC2: has no query string or fragment', () => {
    const url = prUrl('owner/name', 5)!
    expect(url).not.toMatch(/[?#]/)
  })

  it.each(['', 'owner', 'owner/', '/name', 'a/b/c', 'ow ner/name', 'owner/na me', ' owner/name', 'owner/name ', 'ñandú/name', 'owner/nämé', '<script>/x', 'owner/<script>', 'owner/name?x=1', 'owner/name#frag', 'owner/..', 'owner/.', '../name', '-owner/name', 'owner-/name', 'ow_ner/name', 'owner/\nname'])(
    'AC4: returns null for invalid repo %j',
    (repo) => {
      expect(prUrl(repo, 1)).toBeNull()
    },
  )

  it('AC4: enforces owner and repo length limits', () => {
    expect(prUrl(`${'a'.repeat(39)}/name`, 1)).not.toBeNull()
    expect(prUrl(`${'a'.repeat(40)}/name`, 1)).toBeNull()
    expect(prUrl(`owner/${'a'.repeat(100)}`, 1)).not.toBeNull()
    expect(prUrl(`owner/${'a'.repeat(101)}`, 1)).toBeNull()
  })

  it.each([0, -1, 1.5, NaN, Infinity])('AC4: returns null for number %s', (n) => {
    expect(prUrl('owner/name', n)).toBeNull()
  })

  it('AC8: is pure and does not fetch', () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = (() => {
      calls++
      return Promise.reject(new Error('no network'))
    }) as typeof fetch
    try {
      prUrl('owner/name', 3)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })
})
