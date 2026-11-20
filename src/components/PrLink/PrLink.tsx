import type { ReactNode } from 'react'
import { prUrl } from '../../api/prUrl'
import styles from './PrLink.module.css'

export const NEW_TAB_HINT = ' (opens in a new tab)'

type Props = {
  repo: string
  number: number
  children: ReactNode
}

export default function PrLink({ repo, number, children }: Props) {
  const href = prUrl(repo, number)
  if (href === null) return <>{children}</>
  return (
    <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
      {children}{' '}
      <span className={styles.srOnly}>{NEW_TAB_HINT}</span>
    </a>
  )
}
