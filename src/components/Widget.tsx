import { useId } from 'react'
import styles from './Widget.module.css'

type WidgetProps = {
  title: string
  hint: string
}

function Widget({ title, hint }: WidgetProps) {
  const id = useId()
  return (
    <section className={styles.widget} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.body}>Placeholder. No data yet.</div>
    </section>
  )
}

export default Widget
