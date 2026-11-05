// @vitest-environment node
import { expect, it } from 'vitest'
import { readToken } from './config.ts'

it('AC1: readToken returns the trimmed value from the env', () => {
  expect(readToken({ GITHUB_TOKEN: '  fake-token-for-tests-1 ' })).toBe(
    'fake-token-for-tests-1',
  )
})

it('AC1: readToken returns undefined for missing, empty or whitespace values', () => {
  expect(readToken({})).toBeUndefined()
  expect(readToken({ GITHUB_TOKEN: '' })).toBeUndefined()
  expect(readToken({ GITHUB_TOKEN: '   ' })).toBeUndefined()
})
