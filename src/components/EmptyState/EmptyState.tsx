import styles from './EmptyState.module.css'

// Minimal placeholder; #8 replaces it with the real repo-linking UI.
export default function EmptyState() {
  return (
    <div className={styles.empty} data-testid="empty-state">
      <h2 className={styles.heading}>No repositories linked</h2>
      <p className={styles.body}>
        Add repositories to .data/config.json, then run npm run sync to fetch their data.
      </p>
    </div>
  )
}
