# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Team leads and engineering managers who open the dashboard to see how their team is contributing: pull request throughput, review load and pull requests waiting on someone.

## Product Purpose
A local, offline-first dashboard for team contributions. It reads pull request and review data synced from GitHub repos and shows it per team and per member, without calling GitHub at view time.

## Positioning
Runs entirely on the user's machine: a local server holds the GitHub token and serves stored data, so no hosted service ever sees the team's activity.

## Operating Context
Run locally (`npm run dev` or `npm start` on 127.0.0.1). Repos are linked in `.data/config.json` and synced with `npm run sync` (up to 90 days of closed/merged pull requests, open ones always kept).

## Capabilities and Constraints
- Widgets: contributions, PR activity, reviews, waiting; KPI cards, team table, member detail, repository and team-member panels, settings dialog.
- Offline: GitHub tokens and private data are never committed, logged or bundled; the token is read only in `server/`.
- Palette direction is open: the user wants a new brand palette (not the current GitHub-style blue and gray).

## Brand Commitments
No existing brand assets. Binding constraints for the palette: must meet WCAG AA, and must include a composed dark mode alongside light. Standing preference (chosen over bolder worlds): the category standard played straight, near-neutral with one restrained accent, with Linear as the craft reference.

## Evidence on Hand
No testimonials, customers or benchmarks exist; none may be invented.

## Product Principles
- Local and private by default: nothing leaves the machine.
- Scannable at a glance: a lead should read team health in seconds.
- Data first: color and chrome serve the numbers.

## Accessibility & Inclusion
WCAG AA contrast for text, controls and data colors, in both light and dark themes; color is never the only carrier of meaning.
