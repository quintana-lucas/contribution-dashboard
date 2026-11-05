# CLAUDE.md

## Stack
TypeScript, React 19, Vite, Vitest + React Testing Library, oxlint. npm, single package at the repo root. A local Node server in `server/` (bound to 127.0.0.1) holds the GitHub token and serves `/api` and `dist/`.

## Node
Node >= 24 (`engines` in `package.json`, `.nvmrc` = `24`).

## Commands
- Dev: `npm run dev` (Vite plus the local server)
- Start: `npm start` (serves built `dist/` and `/api` on 127.0.0.1:8787)
- Sync: `npm run sync` (validates the token; real sync arrives with #7)
- Test: `npm test`
- Gate: `npm run check` (runs `npm run lint && npm run build && npm test`). It must pass before any commit or PR.

## Security
The app runs locally/offline. `.env` and `.env.*` are gitignored; never commit, log or bundle GitHub tokens, keys or private data.
The token is read only in `server/` and never imported from `src/`. There are no `VITE_` token variables. Tests use fake tokens only.
