export const MISSING_TOKEN =
  'No GitHub token configured. Copy .env.example to .env, set GITHUB_TOKEN, ' +
  'see the README "GitHub token" section, then restart.'

export const INVALID_TOKEN =
  'GitHub rejected the token: it is invalid or expired. Create a new ' +
  'fine-grained token (see the README "GitHub token" section) and update GITHUB_TOKEN.'

export const GITHUB_UNREACHABLE =
  'Could not reach GitHub to check the token.'
