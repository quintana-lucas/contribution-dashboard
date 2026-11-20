import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  /** CSS width (number = px). Defaults to 100%. */
  width?: number | string
  /** CSS height (number = px). Defaults depend on the shape. */
  height?: number | string
  /** `line` is a text-height bar, `block` a taller rounded rectangle. */
  shape?: 'line' | 'block'
  className?: string
}

/**
 * Decorative loading placeholder. It is hidden from assistive tech and has no
 * text. The box that renders it must announce the loading state itself by
 * setting `aria-busy="true"` on its container while data loads.
 */
export default function Skeleton({
  width,
  height,
  shape = 'line',
  className,
}: SkeletonProps) {
  const style: CSSProperties = { width, height }
  const classes = [styles.skeleton, styles[shape], className]
    .filter(Boolean)
    .join(' ')
  return <span className={classes} style={style} aria-hidden="true" data-testid="skeleton" />
}
