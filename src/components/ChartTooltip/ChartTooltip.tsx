import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Portal } from '@visx/tooltip'
import { clampToViewport, type Position } from './clampToViewport'
import styles from './ChartTooltip.module.css'

export interface ChartTooltipRow {
  /** CSS color for the swatch, e.g. `var(--color-series-a)`. */
  color: string
  name: string
  value: ReactNode
}

export interface ChartTooltipProps {
  /** The element the tooltip is attached to (the hovered or focused mark). */
  anchor: HTMLElement
  title: string
  rows: ChartTooltipRow[]
  footer?: ReactNode
}

/** Shared chart tooltip, rendered in a portal so a card never clips it. */
export default function ChartTooltip({ anchor, title, rows, footer }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const size = el.getBoundingClientRect()
    setPosition(
      clampToViewport(
        { left: a.left, top: a.top, width: a.width, height: a.height },
        { width: size.width, height: size.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [anchor, title, rows, footer])

  return (
    <Portal>
      <div
        ref={ref}
        role="tooltip"
        className={styles.tooltip}
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <p className={styles.title}>{title}</p>
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.name} className={styles.row}>
              <span className={styles.swatch} style={{ background: row.color }} aria-hidden="true" />
              <span className={styles.name}>{row.name}</span>
              <span className={styles.value}>{row.value}</span>
            </li>
          ))}
        </ul>
        {footer != null && <p className={styles.footer}>{footer}</p>}
      </div>
    </Portal>
  )
}
