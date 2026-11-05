import styles from './TeamPlaceholder.module.css'

export default function TeamPlaceholder() {
  return (
    <div className={styles.placeholder} data-testid="team-placeholder">
      Placeholder. The team table is not available yet.
    </div>
  )
}
