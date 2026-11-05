# contribution-dashboard

A local, offline-first dashboard for team contributions, built with React and TypeScript.

## Requirements

- Node.js >= 24 (see `.nvmrc`; with nvm run `nvm use`)
- npm (bundled with Node.js)

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the exact dependencies from `package-lock.json` (use on a fresh clone). |
| `npm install` | Installs dependencies and updates `package-lock.json` when you change them. |
| `npm run dev` | Starts Vite (http://localhost:5173 by default) and the local server, with `/api` proxied to the server. |
| `npm start` | Serves the built `dist/` and `/api` on http://127.0.0.1:8787 (or `SERVER_PORT`). Run `npm run build` first. |
| `npm run sync` | Checks that the GitHub token is set and accepted by GitHub. Real syncing arrives with #7. |
| `npm run build` | Type-checks with `tsc -b`, then creates the production build in `dist/`. |
| `npm run lint` | Runs oxlint with `--deny-warnings`, so it fails on any finding, warnings included. |
| `npm test` | Runs the Vitest suite once (no watch mode) and exits non-zero on failure. |
| `npm run check` | Runs `npm run lint`, `npm run build` and `npm test`; exits 0 only if all pass. |

## GitHub token

The local server needs a GitHub token to read pull request data. Without one, the server warns and still serves the UI.

### Create a minimal-scope token

1. On GitHub go to Settings, Developer settings, Personal access tokens, Fine-grained tokens, and create a new token.
2. Set the resource owner to the owner of the repos you want to read.
3. Repository access: "Only select repositories". For public repos only, "Public repositories (read-only)" is enough.
4. Permissions: Metadata: read and Pull requests: read.
5. Set an expiration date.

Do not use a classic token with the `repo` scope: it grants write access.

### Where to put it

Copy `.env.example` to `.env` and set `GITHUB_TOKEN` to the token. `.env` is gitignored; never commit it.

A `GITHUB_TOKEN` already exported in your shell overrides the value in `.env`. If the server uses an unexpected token, unset the shell variable.

Run `npm run sync` to check that the token is accepted.

### Revoke or rotate

Revoke or regenerate the token at GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens. Then replace the value of `GITHUB_TOKEN` in `.env` and restart the server.

### Where the token lives

The token stays in the local server process, which listens only on 127.0.0.1. It never reaches the browser or the built `dist/`.
