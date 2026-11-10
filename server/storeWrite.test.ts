// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRepoInput, readConfig, writeConfig } from './store.ts'

describe('parseRepoInput', () => {
  it('#8 AC2: accepts owner/name and URL forms, rejects the rest', () => {
    for (const ok of [
      'acme/widgets',
      ' github.com/acme/widgets ',
      'https://github.com/acme/widgets',
      'http://github.com/acme/widgets/',
      'github.com/acme/widgets.git',
    ]) {
      expect(parseRepoInput(ok), ok).toBe('acme/widgets')
    }
    for (const bad of ['', 'acme', 'a/b/c', 'https://gitlab.com/acme/widgets', '../etc', 5]) {
      expect(parseRepoInput(bad), String(bad)).toBeNull()
    }
  })
})

describe('writeConfig', () => {
  it('#8 AC2: writes { repos } atomically so readConfig round-trips it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cfg-test-'))
    try {
      await writeConfig(['acme/widgets'], dir)
      expect(JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'))).toEqual({
        repos: ['acme/widgets'],
      })
      expect(await readConfig(dir)).toEqual({ ok: true, repos: ['acme/widgets'] })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
