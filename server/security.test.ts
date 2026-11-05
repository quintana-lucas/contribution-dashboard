// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip',
])

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function trackedTextFiles(): string[] {
  return trackedFiles().filter((f) => !BINARY_EXTENSIONS.has(extname(f).toLowerCase()))
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

describe('leak guards', () => {
  let tempDir: string | undefined
  const originalToken = process.env.GITHUB_TOKEN
  const hadToken = 'GITHUB_TOKEN' in process.env

  afterEach(() => {
    if (hadToken) process.env.GITHUB_TOKEN = originalToken
    else delete process.env.GITHUB_TOKEN
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  })

  it('AC4: the built bundle does not contain the token from the environment', async () => {
    const fake = `fake-token-for-tests-ac4-${Date.now()}-${Math.random().toString(36).slice(2)}`
    tempDir = mkdtempSync(join(tmpdir(), 'dashboard-build-'))
    process.env.GITHUB_TOKEN = fake

    await build({ logLevel: 'silent', build: { outDir: tempDir, emptyOutDir: true } })

    const files = listFiles(tempDir)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(readFileSync(file, 'latin1').includes(fake), file).toBe(false)
    }
  }, 60_000)

  it('AC6: .env files and .data/ are not tracked, and .env.example is', () => {
    const files = trackedFiles()
    const envFiles = files.filter((f) => /(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith('.env.example'))
    expect(envFiles).toEqual([])
    expect(files.filter((f) => f.startsWith('.data/'))).toEqual([])
    expect(files).toContain('.env.example')
  })

  it('AC6: no tracked text file contains a token-shaped string', () => {
    const patterns = [/gh[pousr]_[A-Za-z0-9]{36,}/, /github_pat_[A-Za-z0-9_]{22,}/]
    const offenders = trackedTextFiles().filter((file) => {
      const content = readFileSync(file, 'utf8')
      return patterns.some((p) => p.test(content))
    })
    expect(offenders).toEqual([])
  })

  it('AC10: no VITE_ variable mentions or carries the token', () => {
    const pattern = new RegExp(['VITE', '_', '[A-Z0-9_]*', 'TOKEN'].join(''), 'i')
    const offenders = trackedTextFiles().filter((file) => pattern.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
