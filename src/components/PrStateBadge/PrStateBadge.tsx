import styles from './PrStateBadge.module.css'

export type PrState = 'open' | 'merged' | 'closed'

interface PrStateBadgeProps {
  state: PrState
  /** A draft open PR shows as Draft; the flag is ignored for merged and closed. */
  draft?: boolean
}

type Variant = 'open' | 'merged' | 'closed' | 'draft'

// The single state -> label -> class mapping used by every PR state badge.
const VARIANTS: Record<Variant, { label: string; className: string }> = {
  open: { label: 'Open', className: styles.open },
  merged: { label: 'Merged', className: styles.merged },
  closed: { label: 'Closed', className: styles.closed },
  draft: { label: 'Draft', className: styles.draft },
}

function PrStateBadge({ state, draft = false }: PrStateBadgeProps) {
  const variant = VARIANTS[state === 'open' && draft ? 'draft' : state]
  return <span className={`${styles.badge} ${variant.className}`}>{variant.label}</span>
}

export default PrStateBadge
