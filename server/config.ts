/** Reads the GitHub token. Only `server/` code may import this module. */
export function readToken(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env.GITHUB_TOKEN?.trim()
  return value ? value : undefined
}
