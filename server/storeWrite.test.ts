// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRepoInput, readConfig, readTeam, writeConfig, writeTeam } from './store.ts'

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

describe('team store', () => {
  async function withDir(fn: (dir: string) => Promise<void>) {
    const dir = await mkdtemp(path.join(tmpdir(), 'team-test-'))
    try {
      await fn(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  it('#15 AC4: a missing file reads as first setup', async () => {
    await withDir(async (dir) => {
      expect(await readTeam(dir)).toEqual({ ok: true, selected: null, added: [] })
    })
  })

  it('#15 AC4: writeTeam round-trips through readTeam', async () => {
    await withDir(async (dir) => {
      await writeTeam({ selected: ['ana', 'bob'], added: ['bob'] }, dir)
      expect(await readTeam(dir)).toEqual({ ok: true, selected: ['ana', 'bob'], added: ['bob'] })
    })
  })

  it('#15 AC8: writeTeam stores only selected and added, logins only', async () => {
    await withDir(async (dir) => {
      const extra = { selected: ['ana'], added: [], email: 'a@example.com', name: 'Ana' }
      await writeTeam(extra, dir)
      expect(JSON.parse(await readFile(path.join(dir, 'team.json'), 'utf8'))).toEqual({
        selected: ['ana'],
        added: [],
      })
    })
  })

  it('#15 AC8: bad JSON, wrong shape or an invalid login is rejected', async () => {
    await withDir(async (dir) => {
      const file = path.join(dir, 'team.json')
      for (const content of [
        '{nope',
        'null',
        '{"selected":"ana","added":[]}',
        '{"selected":["ana"]}',
        '{"selected":["bot[bot]"],"added":[]}',
        '{"selected":null,"added":["a b"]}',
      ]) {
        await writeFile(file, content)
        expect(await readTeam(dir), content).toEqual({ ok: false })
      }
    })
  })
})
