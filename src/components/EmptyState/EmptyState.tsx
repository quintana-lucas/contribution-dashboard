import type { Ref } from 'react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  onAddRepositories: () => void
  /** True once a linked repo has been synced: step 2 becomes actionable. */
  canChooseTeam?: boolean
  onChooseTeam?: () => void
  /** Lets the host return focus to the step 2 button. */
  chooseTeamRef?: Ref<HTMLButtonElement>
}

export default function EmptyState({
  onAddRepositories,
  canChooseTeam = false,
  onChooseTeam,
  chooseTeamRef,
}: EmptyStateProps) {
  return (
    <div className={styles.empty} data-testid="empty-state">
      <h2 className={styles.heading}>Set up your dashboard</h2>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.stepTitle}>Add repositories</span>
          <span className={styles.stepBody}>Link the GitHub repositories to read.</span>
        </li>
        {canChooseTeam ? (
          <li className={styles.step}>
            <button
              ref={chooseTeamRef}
              type="button"
              className={styles.stepButton}
              aria-label="Choose your team: open team settings"
              onClick={onChooseTeam}
            >
              <span className={styles.stepTitle}>Choose your team</span>
              <span className={styles.stepBody}>
                Pick the people to follow across those repositories.
              </span>
            </button>
          </li>
        ) : (
          <li className={`${styles.step} ${styles.muted}`}>
            <span className={styles.stepTitle}>
              Choose your team <span className={styles.tag}>Coming soon</span>
            </span>
            <span className={styles.stepBody}>
              Pick the people to follow across those repositories.
            </span>
          </li>
        )}
      </ol>
      <button type="button" className={styles.primary} onClick={onAddRepositories}>
        Add repositories
      </button>
    </div>
  )
}
