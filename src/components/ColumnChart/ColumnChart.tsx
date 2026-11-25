import type { SVGProps } from 'react'
import { Bar } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import ChartFrame, { markSize, useWidth } from '../ChartFrame'
import ChartTooltip, { useChartTooltip } from '../ChartTooltip'
import styles from './ColumnChart.module.css'

export interface ColumnChartBar {
  key: string
  label: string
  value: number
}

interface ColumnChartProps {
  bars: ColumnChartBar[]
  /** Text alternative, rendered as a screen-reader-only figcaption. */
  description: string
  tableCaption: string
  labelHeader: string
  valueHeader: string
  /** CSS color for the bars and the tooltip swatch, e.g. `var(--color-bar)`. */
  color: string
  /** Show only every Nth x label (the table keeps all of them). */
  labelEvery?: number
}

/** Room above the plot for the number over the tallest column. */
const TOP = 20
const PLOT_HEIGHT = 120
const AXIS_HEIGHT = 24
const HEIGHT = TOP + PLOT_HEIGHT + AXIS_HEIGHT
const BASELINE = TOP + PLOT_HEIGHT
/** Below this column pitch (px) the numbers would touch, so they are hidden. */
const MIN_PITCH_FOR_NUMBERS = 8
/** Width used when the real one cannot be measured (no layout engine). */
const FALLBACK_WIDTH = 320

function ColumnChart({
  bars,
  description,
  tableCaption,
  labelHeader,
  valueHeader,
  color,
  labelEvery = 1,
}: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>(FALLBACK_WIDTH)
  const { open, bind } = useChartTooltip<ColumnChartBar>()
  const max = Math.max(0, ...bars.map((b) => b.value))

  const x = scaleBand<string>({
    domain: bars.map((b) => b.key),
    range: [0, width],
    paddingInner: 0.2,
    paddingOuter: 0.1,
  })
  const y = scaleLinear<number>({ domain: [0, max || 1], range: [0, PLOT_HEIGHT] })
  const showNumbers = x.step() >= MIN_PITCH_FOR_NUMBERS

  return (
    <ChartFrame
      focusableMarks
      description={description}
      table={{
        caption: tableCaption,
        labelHeader,
        columns: [valueHeader],
        rows: bars.map((b) => ({ key: b.key, label: b.label, values: [b.value] })),
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
            data-testid="baseline"
            aria-hidden="true"
            x1={0}
            x2={width}
            y1={BASELINE}
            y2={BASELINE}
            stroke="var(--color-border)"
          />
          {bars.map((bar, i) => {
            const h = markSize(bar.value, y)
            const bx = x(bar.key) ?? 0
            return (
              <g
                key={bar.key}
                data-testid="column"
                className={styles.column}
                transform={`translate(${bx}, 0)`}
                tabIndex={0}
                role="img"
                aria-label={`${bar.label}: ${bar.value}`}
                // The hook types its handlers for HTMLElement; the tooltip only needs
                // getBoundingClientRect, which an SVG <g> also has.
                {...(bind(bar) as unknown as SVGProps<SVGGElement>)}
              >
                <rect
                  x={0}
                  y={0}
                  width={x.bandwidth()}
                  height={HEIGHT}
                  fill="transparent"
                  aria-hidden="true"
                />
                {h > 0 && (
                  <g aria-hidden="true">
                    <Bar
                      data-testid="column-bar"
                      x={0}
                      y={BASELINE - h}
                      width={x.bandwidth()}
                      height={h}
                      fill={color}
                    />
                    {showNumbers && (
                      <text
                        data-testid="value"
                        x={x.bandwidth() / 2}
                        y={BASELINE - h - 4}
                        textAnchor="middle"
                        className={styles.text}
                        fill="var(--color-text)"
                      >
                        {bar.value}
                      </text>
                    )}
                  </g>
                )}
                <text
                  data-testid="x-label"
                  aria-hidden="true"
                  x={x.bandwidth() / 2}
                  y={BASELINE + 16}
                  textAnchor="middle"
                  className={styles.text}
                  fill="var(--color-text-muted)"
                >
                  {i % labelEvery === 0 ? bar.label : ''}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {open && (
        <ChartTooltip
          anchor={open.anchor}
          title={open.data.label}
          rows={[{ color, name: valueHeader, value: open.data.value }]}
        />
      )}
    </ChartFrame>
  )
}

export default ColumnChart
