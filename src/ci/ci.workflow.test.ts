import { describe, expect, it } from 'vitest'
// Read as plain text via Vite's `?raw` (no node types needed, no YAML dependency).
import workflow from '../../.github/workflows/ci.yml?raw'
import nvmrc from '../../.nvmrc?raw'

describe('CI workflow', () => {
  it('AC1: runs on pull_request and on push to main', () => {
    expect(workflow).toMatch(/^on:\s*$/m)
    expect(workflow).toMatch(/^ {2}pull_request:/m)
    expect(workflow).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[\s*main\s*\]/m)
  })

  it('AC2: uses Node from .nvmrc, which is 24', () => {
    expect(workflow).toMatch(/node-version-file:\s*\.nvmrc/)
    expect(nvmrc.trim()).toBe('24')
  })

  it('AC3: runs npm run check without continue-on-error or always()', () => {
    expect(workflow).toMatch(/run:\s*npm run check\s*$/m)
    expect(workflow).not.toMatch(/continue-on-error/)
    expect(workflow).not.toMatch(/always\(\)/)
  })

  it('AC4: uses no secrets and read-only permissions', () => {
    expect(workflow).not.toMatch(/secrets\./)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/)
  })

  it('AC5: caches npm dependencies', () => {
    expect(workflow).toMatch(/cache:\s*npm/)
  })
})
