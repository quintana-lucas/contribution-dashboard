# ADR 0001: Where the GitHub token lives and who fetches data

## Status

Accepted, 2026-11-05. Decided by the product owner. Issue #5.

## Context

The dashboard shows data from GitHub repositories. It must run locally and offline-first, with no hosted service and no sign-up. Fetching from GitHub needs a token. Which process holds that token, and which process calls GitHub, decides how safe the product is.

Risks to avoid:

- `VITE_*` variables are inlined into the bundle and end up in `dist/`.
- `localStorage` is readable by any script running on the same origin.
- A token in logs, error messages, test fixtures or git history is a leak.

Evidence, not a decision: the earlier design of this product read the token from an environment variable named `GITHUB_TOKEN`. That is cited as evidence of a conventional name. The choice below was made on its own merits.

## Options considered

(a) Local Node CLI that holds the token and writes data to disk.
(b) Vite dev-server middleware/proxy that holds the token.
(c) Browser holding the token (env var, `localStorage` or pasted at runtime).
(d) Local Node server that holds the token, exposes same-origin `/api/*` endpoints and serves `dist/` in production.

| | (a) CLI | (b) Vite middleware | (c) Browser token | (d) Local Node server |
|---|---|---|---|---|
| Where the token is stored | `.env` / shell env, read by the CLI process | `.env`, read by `vite.config.ts` | `VITE_*` env var, `localStorage`, or memory after pasting | `.env` / shell env, read by the server process only |
| Can reach the Vite bundle | No | Possible: one `define` in `vite.config.ts` away | Yes (`VITE_*` is inlined) | No |
| Can reach `dist/` | No | Possible if misconfigured | Yes with `VITE_*` | No |
| Can reach logs | Only if the CLI logs it (check 4) | Same, plus dev-server logs | Browser console, devtools, extensions | Only if the server logs it (check 4) |
| Can reach git history | Only if `.env` is committed (check 2) | Same | Same, plus any committed build output | Same as (a) |
| Can reach test fixtures | Only by mistake (check 7) | Same | Likely: tests must set the token in the browser | Only by mistake (check 7) |
| How data reaches the UI | Files on disk; the UI cannot read disk by itself, so it needs another channel | Dev-server endpoints | The browser calls `api.github.com` directly | Same-origin `/api/*` served by the local server |
| Works after `npm run build` without a dev server | Data is fetched, but the UI has no way to read it | No: the API exists only while `vite`/`vite preview` runs | Yes, but with the token in the browser | Yes: the server serves `dist/` and `/api` |
| UI can validate a repo or trigger a sync | No (#8 AC2, AC5, AC12 fail) | Only while the dev server runs | Yes | Yes |
| Minimum token scope | Fine-grained PAT, read-only (see Token scope) | Same | Same, but exposure is much higher | Same |
| Revoke / rotate | GitHub settings, then replace the value in `.env` | Same | Same, plus clear `localStorage` and rebuild if inlined | Same |

### (a) Local Node CLI

The token lives in `.env` or the shell env and only the CLI process reads it. It cannot reach the bundle. Data is written to disk. The weakness is the UI: a browser app cannot read the local disk, so the UI cannot validate a repo or start a sync, which #8 (AC2, AC5, AC12) requires. Rejected as the sole mechanism.

### (b) Vite dev-server middleware/proxy

The token lives in `.env` and is read in `vite.config.ts`. The API exists only while `vite` or `vite preview` runs, so it does not work after `npm run build` on its own. The token sits one `define` entry away from being inlined into the bundle. Rejected.

### (c) Browser-held token

A `VITE_*` variable is inlined into `dist/`. `localStorage` is readable by any script on the origin, and a pasted token lives in page memory and devtools. It contradicts #6 AC4 and #8 AC7. Rejected.

### (d) Local Node server

One Node process bound to `127.0.0.1` reads the token, calls GitHub, stores data on disk and exposes same-origin `/api/*` endpoints. In production it also serves `dist/`. In development Vite proxies `/api` to it (`server.proxy`). The sync logic is also runnable as a CLI (`npm run sync`). The token never enters the browser or the bundle. It works after `npm run build`. Chosen.

## Decision

Option (d), the local Node server.

- The server binds to `127.0.0.1`, holds the token, exposes same-origin `/api/*` endpoints and serves `dist/` in production.
- In development, Vite proxies `/api` to the server (`server.proxy`).
- The sync logic is also available as a CLI: `npm run sync`.

Why the others were rejected:

- (a) CLI only: the UI cannot validate a repo or trigger a sync (#8 AC2, AC5, AC12).
- (b) Vite middleware: the API exists only while `vite`/`vite preview` runs, and the token sits in `vite.config.ts` one `define` away from the bundle.
- (c) Browser-held token: `VITE_*` is inlined into `dist/`, `localStorage` is readable by any script on the origin, and it contradicts #6 AC4 and #8 AC7.

### Token

- Variable name: `GITHUB_TOKEN`.
- Source: the gitignored `.env` file, loaded with `node --env-file-if-exists=.env`, or the shell environment.
- Only the server process (and the CLI sync) reads it.
- No `VITE_`-prefixed variable carries the token. Check 3 enforces this.
- The earlier design's use of `GITHUB_TOKEN` is evidence for the conventional name, not the reason for the decision. It was kept on purpose.
- Known caveat: a `GITHUB_TOKEN` already exported in the shell takes effect (a shell value takes precedence over the `.env` file). The README must say so.

## Consequences

- Positive: the token stays out of the browser, the bundle and `dist/`. The app works after `npm run build`. The UI can validate repos and sync.
- A Node server is now part of the product. CLAUDE.md's "no backend" line and the README commands must be updated by the issue that adds the server (#6), together with `npm start`, the `/api` proxy in `vite.config.ts`, and server tests in a Node environment.
- Experiments for this spike are not merged (AC7). This ADR is the only deliverable.
- The README must document the shell-env caveat above.

## Security checks for follow-ups

Each check is testable. The owner is the follow-up issue that must implement it.

1. With a fake token in the env, after `npm run build`, the token string appears in no file under `dist/`. Owner: #6.
2. `git ls-files` lists no `.env` or `.env.*` except `.env.example`, and nothing under `.data/`. Owner: #6.
3. No `VITE_`-prefixed variable in the repo mentions a token. Owner: #6.
4. Errors and logs of the data layer never contain the token (unit test with a fake token, including the 401 path). Owner: #7.
5. `/api/token-status` returns only `{ "configured": boolean }` (test asserts the body). Owner: #8.
6. Code under `src/` never calls `api.github.com` (fetch-spy test, existing pattern). Owner: #8.
7. Tests use fake fixtures and a fake token, no real network. Owner: #7 and #13.
8. The server binds `127.0.0.1` and rejects a foreign `Origin`/`Host` (test). Owner: #6.
9. Stored files contain only the allowed fields (schema test). Owner: #7.

## Data store

- Location: `.data/` at the repo root. It is gitignored (`.gitignore` block "Local GitHub data (never commit)").
- Format: JSON.
  - `.data/config.json`: linked repos. No token.
  - `.data/repos/<owner>__<name>.json`: pull requests, reviews and last sync time for one repo.
- Content: only public activity fields (logins, dates, states, counts). No token, email or private data.

## UI and data-access contract

The server binds to `127.0.0.1` and rejects requests whose `Host` or `Origin` is not localhost. The UI never calls `api.github.com`; it only calls these endpoints.

| Endpoint | Purpose |
|---|---|
| `GET /api/token-status` | Returns `{ "configured": boolean }`. Never returns the token. |
| `GET /api/repos` | Linked repos with their last sync time. |
| `POST /api/repos` with `{ "repo": "owner/name" }` | Validates the format and existence against GitHub (read-only), persists the repo, starts the first sync and returns the result: added plus people found, or an error code `invalid_format`, `duplicate`, `not_found_or_no_access`. |
| `DELETE /api/repos/:owner/:name` | Stops reading the repo and deletes its local data. Deletes nothing on GitHub. |
| `POST /api/repos/:owner/:name/sync` | Manual sync. Returns success or failure with a token-free message. |
| `GET /api/data?repo=owner/name` (example) | Stored data for charts. Exact shape is left to #7 and #13. |

## Token scope and rotation

- Use a fine-grained personal access token.
  - Resource owner: the owner of the repos.
  - Repository access: "Only select repositories".
  - Permissions: Metadata: read and Pull requests: read.
  - Set an expiration date.
- For public repos only, "Public repositories (read-only)" is enough.
- A classic PAT with the `repo` scope is discouraged because it grants write access.
- Revoke or rotate at GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens. Then replace the value of `GITHUB_TOKEN` in `.env` and restart the server.
