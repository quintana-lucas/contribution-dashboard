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
| `npm run dev` | Starts the Vite dev server (http://localhost:5173 by default). |
| `npm run build` | Type-checks with `tsc -b`, then creates the production build in `dist/`. |
| `npm run lint` | Runs oxlint with `--deny-warnings`, so it fails on any finding, warnings included. |
| `npm test` | Runs the Vitest suite once (no watch mode) and exits non-zero on failure. |
| `npm run check` | Runs `npm run lint`, `npm run build` and `npm test`; exits 0 only if all pass. |
