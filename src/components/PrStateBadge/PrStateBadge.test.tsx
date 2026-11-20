import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrStateBadge from '.'

// Vitest blanks CSS modules (class names are undefined), so read the source for colors.
const css = readFileSync('src/components/PrStateBadge/PrStateBadge.module.css', 'utf8')

function rule(selector: string): string {
  const m = new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(css)
  if (!m) throw new Error(`missing ${selector}`)
  return m[1]
}

function expectTokens(selector: string, name: string) {
  const body = rule(selector)
  expect(body).toContain(`color: var(--color-pr-${name});`)
  expect(body).toContain(`background: var(--color-pr-${name}-bg);`)
  expect(body).toContain(`border-color: var(--color-pr-${name});`)
}

describe('PrStateBadge', () => {
  it('AC1: open shows the Open label and uses the green open tokens', () => {
    render(<PrStateBadge state="open" />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expectTokens('.open', 'open')
  })

  it('AC2: merged shows the Merged label and uses the purple merged tokens', () => {
    render(<PrStateBadge state="merged" />)
    expect(screen.getByText('Merged')).toBeInTheDocument()
    expectTokens('.merged', 'merged')
  })

  it('AC3: closed shows the Closed label and uses the red closed tokens', () => {
    render(<PrStateBadge state="closed" />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expectTokens('.closed', 'closed')
  })

  it('AC4: draft shows Draft with the gray tokens and wins over open', () => {
    render(<PrStateBadge state="open" draft />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByText('Open')).toBeNull()
    expectTokens('.draft', 'draft')
  })

  it('AC4: the draft flag is ignored for merged and closed', () => {
    const { rerender } = render(<PrStateBadge state="merged" draft />)
    expect(screen.getByText('Merged')).toBeInTheDocument()
    rerender(<PrStateBadge state="closed" draft />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('AC5 AC6: component CSS uses tokens only, with no hex, rgb or hsl literals', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba?\(|hsla?\(/)
    for (const m of css.matchAll(/(?<![-\w])color:\s*([^;]+);/g)) {
      expect(m[1]).toMatch(/^var\(--color-pr-/)
    }
    expect(css).not.toMatch(/caution|--color-add|--color-del/)
  })
})
