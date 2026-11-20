# Building a chart

The chart foundation is a small set of shared pieces. No existing chart consumes it yet; new and rebuilt charts should.

## Pieces

| Piece | Where | What it gives you |
| --- | --- | --- |
| `ChartFrame` | `src/components/ChartFrame` | Accessible shell: text alternative, `aria-hidden` plot, "Show as table" fallback. |
| `ChartRowText` | `src/components/ChartFrame` | Screen-reader-only text for one row (the `rows` variant). |
| `markSize`, `CHART_MIN_MARK` | `src/components/ChartFrame/markSize.ts` | Mark sizing with the minimum-mark rule. |
| `ChartTooltip` | `src/components/ChartTooltip` | Shared tooltip, rendered in a portal (`@visx/tooltip` `Portal`). |
| `useChartTooltip` | `src/components/ChartTooltip` | Hover, focus, Escape and touch behavior. |
| `clampToViewport` | `src/components/ChartTooltip` | Pure placement helper used by `ChartTooltip`. |
| Test helpers | `src/test/chart.ts` | `mockResizeObserver`, `mockElementRect`, `renderChart`. |
| Tokens | `src/styles/tokens.css` | `--shadow-tooltip`, `--chart-min-mark`, `--color-bar`, `--color-bar-muted`, `--color-good`, `--color-caution`. |

Installed: `@visx/tooltip`, `@visx/shape` and `@visx/scale` (Reviews chart). Add another `@visx/*` package only in the change that imports it (a test fails if one is listed but unused).

## ChartFrame

```tsx
<ChartFrame
  description="Pull requests opened per week, last 12 weeks."
  table={{
    caption: 'Pull requests per week',
    labelHeader: 'Week',
    columns: ['Opened', 'Merged'],
    rows: [{ key: 'w1', label: 'Mar 3', values: [4, 2] }],
  }}
>
  {/* marks */}
</ChartFrame>
```

- `variant="figure"` (default): a `<figure>` with a screen-reader-only `<figcaption>` (`description`), the marks in an `aria-hidden` slot (`data-testid="chart-plot"`), optional `legend` (not hidden) and `axis` (hidden).
- `variant="rows"`: a plain wrapper for lists of rows (BarList, ReviewsChart style). Each row carries its own hidden text with `<ChartRowText>`.
- `table` is required in both variants and must contain every value shown by the marks, zeros included. Marks are never the only place a value exists.

## Tooltip

```tsx
const { open, bind } = useChartTooltip<Datum>()

<rect {...bind(datum)} tabIndex={0} />

{open && (
  <ChartTooltip
    anchor={open.anchor}
    title={open.data.label}
    rows={[{ color: 'var(--color-bar)', name: 'Opened', value: open.data.opened }]}
    footer="Optional note"
  />
)}
```

- `bind(data)` returns `onMouseEnter`, `onMouseLeave`, `onFocus`, `onBlur`, `onKeyDown`, `onTouchStart`. Hover opens after `HOVER_DELAY_MS` (100 ms), focus opens at once, Escape closes, a touch opens and a touch outside the anchor closes.
- `ChartTooltip` props: `anchor` (the hovered/focused element), `title`, `rows` (`{ color, name, value }`, one per series, zeros included), optional `footer`. It uses `role="tooltip"`, has no animation and is kept inside the viewport by `clampToViewport`.
- The tooltip is an extra, not the only way to read a value: values must also be visible or in the table.

## Colors

Colors always come from `var(--color-*)` tokens; chart CSS must not hardcode a hex/rgb value (a test checks this). Series-to-token mapping from the #85 design brief:

| Series | Chart | Token |
| --- | --- | --- |
| Approved | Reviews | `--color-good` |
| Changes requested | Reviews | `--color-caution` |
| Commented | Reviews | `--color-bar-muted` |
| Opened | PR activity | `--color-bar` |
| Merged | PR activity | `--color-good` |
| Closed | PR activity | `--color-caution` |

Avoid `--color-accent` (it reads as interactive) and `--color-add` / `--color-del` (they mean added/deleted lines).

Pass the token as the tooltip row `color` (`var(--color-bar)`), so the swatch matches the mark and follows the theme.

## Minimum mark

`markSize(value, scale, { min })` returns 0 for a zero (draw nothing), and for any other value at least `min` (default `CHART_MIN_MARK` = 4, equal to `--chart-min-mark` in `tokens.css`; a test keeps them in sync). Use it for bar heights and widths so a small non-zero value stays visible next to a large maximum.

## Testing

jsdom has no layout. `src/test/chart.ts` offers:

- `mockResizeObserver(size)`: fake `ResizeObserver` reporting `size`; returns a restore function. Only needed if a chart uses `@visx/responsive`.
- `mockElementRect(rect)`: every `getBoundingClientRect` returns `rect` (tooltip placement); returns a restore function.
- `renderChart(ui, size)`: renders with the fake `ResizeObserver`; `unmount` restores it.
