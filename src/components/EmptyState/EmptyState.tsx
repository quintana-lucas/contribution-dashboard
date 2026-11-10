import styles from './EmptyState.module.css'

interface EmptyStateProps {
  onAddRepositories: () => void
}

export default function EmptyState({ onAddRepositories }: EmptyStateProps) {
  return (
    <div className={styles.empty} data-testid="empty-state">
      <h2 className={styles.heading}>Set up your dashboard</h2>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.stepTitle}>Add repositories</span>
          <span className={styles.stepBody}>Link the GitHub repositories to read.</span>
        </li>
        <li className={`${styles.step} ${styles.muted}`}>
          <span className={styles.stepTitle}>
            Choose your team <span className={styles.tag}>Coming soon</span>
          </span>
          <span className={styles.stepBody}>
            Pick the people to follow across those repositories.
          </span>
        </li>
      </ol>
      <button type="button" className={styles.primary} onClick={onAddRepositories}>
        Add repositories
      </button>
    </div>
  )
}
