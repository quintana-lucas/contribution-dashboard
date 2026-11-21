import { useLayoutEffect, useRef, useState } from 'react'
import type { SVGProps } from 'react'
import { Bar } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import type { PrActivityBucket } from '../../api/prActivity.ts'
import ChartFrame, { markSize } from '../ChartFrame'
import ChartTooltip, { useChartTooltip } from '../ChartTooltip'
import styles from './PrActivityChart.module.css'

interface PrActivityChartProps {
  buckets: PrActivityBucket[]
  /** "day" or "week": names the bucket size in the text alternative and table. */
  unit: 'day' | 'week'
}

const SERIES = [
  { key: 'opened', label: 'Opened', color: 'var(--color-bar)' },
  { key: 'merged', label: 'Merged', color: 'var(--color-good)' },
  { key: 'closed', label: 'Closed', color: 'var(--color-caution)' },
] as const

/** Room above the plot for the number over the tallest column and the max label. */
const TOP = 20
const PLOT_HEIGHT = 120
const AXIS_HEIGHT = 24
const HEIGHT = TOP + PLOT_HEIGHT + AXIS_HEIGHT
/** Columns at least this tall (px) carry their number inside; shorter ones above. */
const INSIDE_MIN = 16
/** Width used when the real one cannot be measured (no layout engine). */
const FALLBACK_WIDTH = 320

/** Measures the width in px of the element the returned ref is attached to. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (w: number) => setWidth((prev) => (prev === w ? prev : w))
    read(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) read(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width || FALLBACK_WIDTH] as const
}

function PrActivityChart({ buckets, unit }: PrActivityChartProps) {
  const [ref, width] = useWidth()
  const { open, bind } = useChartTooltip<PrActivityBucket>()
  const max = Math.max(0, ...buckets.flatMap((b) => SERIES.map((s) => b[s.key])))
  const total = (key: (typeof SERIES)[number]['key']) => buckets.reduce((sum, b) => sum + b[key], 0)
  const description = `Pull requests per ${unit}: ${SERIES.map((s) => `${total(s.key)} ${s.label.toLowerCase()}`).join(', ')}.`

  const x = scaleBand<string>({
    domain: buckets.map((b) => b.fullLabel),
    range: [0, width],
    paddingInner: 0.2,
    paddingOuter: 0.1,
  })
  const inner = scaleBand<string>({
    domain: SERIES.map((s) => s.key),
    range: [0, x.bandwidth()],
    padding: 0.05,
  })
  const y = scaleLinear<number>({ domain: [0, max || 1], range: [0, PLOT_HEIGHT] })
  const baseline = TOP + PLOT_HEIGHT
  const maxY = baseline - y(max || 1)

  return (
    <ChartFrame
      focusableMarks
      description={description}
      legend={
        <ul className={styles.legend} aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: s.color }} aria-hidden="true" />
              {`${s.label} (${total(s.key)})`}
            </li>
          ))}
        </ul>
      }
      table={{
        caption: `Pull requests per ${unit}`,
        labelHeader: unit === 'day' ? 'Day' : 'Week',
        columns: SERIES.map((s) => s.label),
        rows: buckets.map((b) => ({
          key: b.fullLabel,
          label: b.fullLabel,
          values: SERIES.map((s) => b[s.key]),
        })),
      }}
    >
      <div ref={ref} className={styles.plot}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          height={HEIGHT}
          focusable="false"
        >
          <line
            data-testid="max-gridline"
            aria-hidden="true"
            x1={0}
            x2={width}
            y1={maxY}
            y2={maxY}
            stroke="var(--color-border)"
            strokeDasharray="2 3"
          />
          <text
            data-testid="max-label"
            aria-hidden="true"
            x={0}
            y={maxY - 4}
            className={styles.text}
            fill="var(--color-text-muted)"
          >
            {max}
          </text>
          <line
            data-testid="baseline"
            aria-hidden="true"
            x1={0}
            x2={width}
            y1={baseline}
            y2={baseline}
            stroke="var(--color-border)"
          />
          {buckets.map((b, i) => (
            <g
              key={b.fullLabel}
              data-testid="group"
              className={styles.group}
              transform={`translate(${x(b.fullLabel) ?? 0}, 0)`}
              tabIndex={0}
              role="img"
              aria-label={`${b.fullLabel}: ${SERIES.map((s) => `${b[s.key]} ${s.label.toLowerCase()}`).join(', ')}`}
              // The hook types its handlers for HTMLElement; the tooltip only needs
              // getBoundingClientRect, which an SVG <g> also has.
              {...(bind(b) as unknown as SVGProps<SVGGElement>)}
            >
              <rect
                x={0}
                y={0}
                width={x.bandwidth()}
                height={HEIGHT}
                fill="transparent"
                aria-hidden="true"
              />
              {SERIES.map((s) => {
                const h = markSize(b[s.key], y)
                const bx = inner(s.key) ?? 0
                if (h === 0) return null
                const inside = h >= INSIDE_MIN
                return (
                  <g key={s.key} aria-hidden="true">
                    <Bar
                      data-series={s.key}
                      x={bx}
                      y={baseline - h}
                      width={inner.bandwidth()}
                      height={h}
                      fill={s.color}
                    />
                    <text
                      data-testid="value"
                      data-placement={inside ? 'inside' : 'above'}
                      x={bx + inner.bandwidth() / 2}
                      y={inside ? baseline - h / 2 : baseline - h - 3}
                      textAnchor="middle"
                      dominantBaseline={inside ? 'central' : undefined}
                      className={styles.text}
                      fill={inside ? 'var(--color-on-accent)' : 'var(--color-text)'}
                    >
                      {b[s.key]}
                    </text>
                  </g>
                )
              })}
              <text
                aria-hidden="true"
                x={x.bandwidth() / 2}
                y={baseline + 16}
                textAnchor="middle"
                className={styles.text}
                fill="var(--color-text-muted)"
              >
                {buckets.length > 8 && i % 2 === 1 ? '' : b.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {open && (
        <ChartTooltip
          anchor={open.anchor}
          title={open.data.fullLabel}
          rows={SERIES.map((s) => ({ color: s.color, name: s.label, value: open.data[s.key] }))}
        />
      )}
    </ChartFrame>
  )
}

export default PrActivityChart
