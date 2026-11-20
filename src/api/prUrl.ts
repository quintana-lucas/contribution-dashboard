const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const NAME = /^[A-Za-z0-9._-]+$/

/**
 * Web address of a pull request, built only from the stored repo full name
 * ("owner/name") and the PR number. Returns null when either is invalid.
 */
export function prUrl(repo: string, number: number): string | null {
  if (typeof repo !== 'string' || !Number.isSafeInteger(number) || number <= 0) return null
  const parts = repo.split('/')
  if (parts.length !== 2) return null
  const [owner, name] = parts
  if (owner.length > 39 || !OWNER.test(owner)) return null
  if (name.length > 100 || name === '.' || name === '..' || !NAME.test(name)) return null
  return `https://github.com/${owner}/${name}/pull/${number}`
}
