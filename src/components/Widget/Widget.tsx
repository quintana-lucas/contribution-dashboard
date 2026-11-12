import { useId } from 'react'
import type { ReactNode } from 'react'
import styles from './Widget.module.css'

type WidgetProps = {
  title: string
  hint: string
  /** Replaces the placeholder body when present. */
  children?: ReactNode
}

function Widget({ title, hint, children }: WidgetProps) {
  const id = useId()
  return (
    <section className={styles.widget} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      <p className={styles.hint}>{hint}</p>
      {children === undefined ? (
        <div className={styles.body}>Placeholder. No data yet.</div>
      ) : (
        <div className={styles.content}>{children}</div>
      )}
    </section>
  )
}

export default Widget
