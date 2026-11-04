# CLAUDE.md

## Stack
TypeScript, React 19, Vite, Vitest + React Testing Library, oxlint. npm, single package at the repo root, no backend.

## Node
Node >= 24 (`engines` in `package.json`, `.nvmrc` = `24`).

## Commands
- Dev: `npm run dev`
- Test: `npm test`
- Gate: `npm run check` (runs `npm run lint && npm run build && npm test`). It must pass before any commit or PR.

## Security
The app runs locally/offline. `.env` and `.env.*` are gitignored; never commit, log or bundle GitHub tokens, keys or private data.
