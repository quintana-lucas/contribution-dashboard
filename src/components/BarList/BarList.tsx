import { Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { markSize, useWidth } from '../ChartFrame'
import ChartTooltip, { useChartTooltip } from '../ChartTooltip'
import styles from './BarList.module.css'

export interface BarListItem {
  key: string
  label: string
  value: number
  /** Shorthand for `variant: 'muted'`; ignored when `variant` is set. */
  muted?: boolean
  variant?: BarVariant
  srText: string
}

export type BarVariant = 'solid' | 'muted' | 'caution'

interface BarListProps {
  label: string
  items: BarListItem[]
  /** Name of the counted thing, shown as the tooltip row name (e.g. "Merged PRs"). */
  valueLabel?: string
}

const VARIANT_COLOR: Record<BarVariant, string> = {
  solid: 'var(--color-good)',
  muted: 'var(--color-bar-muted)',
  caution: 'var(--color-caution)',
}

const BAR_HEIGHT = 12
/** Width used when the real one cannot be measured (no layout engine). */
const FALLBACK_WIDTH = 200

type TooltipBind = ReturnType<typeof useChartTooltip<BarListItem>>['bind']

interface BarRowProps {
  item: BarListItem
  max: number
  bind: TooltipBind
}

function BarRow({ item, max, bind }: BarRowProps) {
  const [ref, width] = useWidth<HTMLSpanElement>(FALLBACK_WIDTH)
  const variant: BarVariant = item.variant ?? (item.muted ? 'muted' : 'solid')
  const x = scaleLinear<number>({ domain: [0, max || 1], range: [0, width] })
  // Items outside the scale (e.g. "Others") are clamped to the track.
  const size = Math.min(width, markSize(item.value, x))

  return (
    <li className={styles.row} tabIndex={0} {...bind(item)}>
      <span className={styles.srOnly}>{item.srText}</span>
      <span className={styles.name} title={item.label} aria-hidden="true">
        {item.label}
      </span>
      <span ref={ref} className={styles.track} aria-hidden="true">
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${BAR_HEIGHT}`}
          height={BAR_HEIGHT}
          focusable="false"
        >
          <rect x={0} y={0} width={width} height={BAR_HEIGHT} fill="var(--color-border)" />
          {size > 0 && (
            <Bar
              data-testid="bar-fill"
              data-variant={variant}
              data-muted={variant === 'muted' ? 'true' : 'false'}
              x={0}
              y={0}
              width={size}
              height={BAR_HEIGHT}
              fill={VARIANT_COLOR[variant]}
            />
          )}
        </svg>
      </span>
      <span className={styles.count} aria-hidden="true">
        {item.value}
      </span>
    </li>
  )
}

function BarList({ label, items, valueLabel = 'Count' }: BarListProps) {
  const { open, bind } = useChartTooltip<BarListItem>()
  // Only legacy `muted` items (e.g. "Others") are excluded from the scale.
  const max = Math.max(0, ...items.filter((i) => !(i.muted && !i.variant)).map((i) => i.value))

  return (
    <>
      <ol className={styles.list} aria-label={label}>
        {items.map((item) => (
          <BarRow key={item.key} item={item} max={max} bind={bind} />
        ))}
      </ol>
      {open && (
        <ChartTooltip
          anchor={open.anchor}
          title={open.data.label}
          rows={[
            {
              color: VARIANT_COLOR[open.data.variant ?? (open.data.muted ? 'muted' : 'solid')],
              name: valueLabel,
              value: open.data.value,
            },
          ]}
        />
      )}
    </>
  )
}

export default BarList
