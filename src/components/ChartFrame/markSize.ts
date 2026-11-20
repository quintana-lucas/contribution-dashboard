/** Mirrors `--chart-min-mark` in src/styles/tokens.css (a test keeps them equal). */
export const CHART_MIN_MARK = 4

/**
 * Size in px of a mark for `value`: a zero draws nothing, any other value is
 * at least `min` so it stays visible next to a large maximum.
 */
export function markSize(
  value: number,
  scale: (value: number) => number,
  { min = CHART_MIN_MARK }: { min?: number } = {},
): number {
  if (!(value > 0)) return 0
  return Math.max(min, scale(value))
}
