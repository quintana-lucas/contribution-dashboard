export const MISSING_TOKEN =
  'No GitHub token configured. Copy .env.example to .env, set GITHUB_TOKEN, ' +
  'see the README "GitHub token" section, then restart.'

export const INVALID_TOKEN =
  'GitHub rejected the token: it is invalid or expired. Create a new ' +
  'fine-grained token (see the README "GitHub token" section) and update GITHUB_TOKEN.'

export const GITHUB_UNREACHABLE =
  'Could not reach GitHub to check the token.'

export type SyncErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'network'
  | 'bad_response'

export const SYNC_MESSAGES: Record<SyncErrorCode, string> = {
  unauthorized:
    'GitHub rejected the token: it is invalid or expired. Create a new ' +
    'fine-grained token (see the README "GitHub token" section) and update GITHUB_TOKEN.',
  not_found:
    'The repository does not exist or the token has no access to it. ' +
    'Check the owner/name and the token repository permissions.',
  forbidden:
    'GitHub denied access to this repository. Grant the token read access to ' +
    'Pull requests and Metadata for it, then try again.',
  rate_limited:
    'GitHub rate limit reached. Wait a few minutes and run the sync again; ' +
    'previously stored data is kept.',
  network:
    'Could not reach GitHub. Check your internet connection and try again; ' +
    'previously stored data is kept.',
  bad_response:
    'GitHub returned an unexpected response. Try again later; previously stored data is kept.',
}
