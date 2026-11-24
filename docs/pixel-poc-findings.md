POC - not to merge as-is

# Pixel-art style POC: findings

Status: POC (issue #103). Not verified in a real browser yet.

## Review materials

- Comparison Artifact (current vs pixel): https://claude.ai/artifact/CTS6v3tqkfRaVsz8S9cW1e
- This Artifact is a mockup with sample data, not captures of the running app. It approximates the look but does not prove how the real components render.
- Every item under "Could not verify visually" below is still unverified and needs a real-browser check by the owner (1x and 2x displays, 375px width, light and dark mode).

## What changed in the legibility pass

- Type scale retuned for Press Start 2P (drawn on an 8px grid, roughly 2x wider than the old sans):
  `--text-sm` 0.5rem (8px), `--text-md` and `--text-lg` 0.75rem (12px), `--text-xl` 1rem (16px).
  Line heights raised (sm 2, md 1.8, lg 1.7, xl 1.5) because the glyphs are tall and dense.
  0.75rem is a deliberate 1.5x step, not an integer multiple: 8px is too small for body copy and 16px too wide.
- `font-synthesis: none` on `body`: the font has one weight, so the many `font-weight: 600/700` rules would otherwise be faux-bolded and smear the pixels.
- `shape-rendering="crispEdges"` on the four chart SVGs (BarList, ColumnChart, PrActivityChart, ReviewsChart) so bars, gridlines and baselines do not anti-alias.
- Overflow guards (from CSS reasoning only):
  - KPI cards (`StatCard`): `overflow-wrap: anywhere` on label and value. A 2-column mobile card has about 130px of content width, and "Lines changed (+/-)" at 8px needs about 150px.
  - `MemberDetail`: same on tile `.number` and `.label` (three tiles on mobile have about 66px of content width each; "Average PR size" is 120px).
  - `WaitingWidget`: `overflow-wrap: anywhere` on `.meta` (long repo and author names).
  - `Toolbar`: `max-width: 100%` on the select, `flex-wrap` on the segmented control, `overflow-wrap` on the subline.
  - `TeamTable` needed no change: it is `width: max-content` inside a scroller with `nowrap` cells, so wider text only lengthens the horizontal scroll.
  - Fixed `4ch` count columns (`BarList`, `ReviewsChart`) scale with the font, so they stay correct.

## tabular-nums

Press Start 2P is monospaced, so every digit already has the same advance. `font-variant-numeric: tabular-nums` is a no-op with this font (kept in the CSS, harmless). Numeric columns stay aligned.

## Could not verify visually (check with screenshots)

- Whether 8px (`--text-sm`) is readable on 1x displays for labels, sublines, table cells and chart axis text. Likely the weakest spot.
- Chart axis and value labels: SVG `<text>` sizes come from the same tokens; collisions between value labels and the `CHART_MIN_MARK` bars are unchecked.
- KPI cards at 375px: whether wrapped values look acceptable or need a smaller `--text-xl` on mobile.
- TeamTable: width of the sticky member column with the wider font, and the hard shadow when scrolled.
- Toolbar: wrapping of the segmented control and the 44px min-height controls with 12px text.
- Header title at 16px next to the theme toggle on narrow screens.
- Modal (settings) width with long repo names, and `SettingsDialog` grid `1fr auto`.
- Whether `crispEdges` produces uneven bar widths at fractional band sizes (bars of 5px and 6px next to each other).
- Contrast of the 3px hard borders and shadows in dark mode.

## Worth keeping (preliminary)

- The token-driven approach: radius, border width, shadow and font all switched from `tokens.css` with a small sweep, which is what the POC needed to show.
- Zero radius plus thick borders plus hard shadows read as pixel-art even with the existing palette.

## Likely problems

- Press Start 2P is a display font: dense tables and long PR titles will be tiring to read.
- Only one weight, so hierarchy has to come from size, color and spacing.
