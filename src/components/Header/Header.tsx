import type { ReactNode, Ref } from 'react'
import ThemeToggle from '../ThemeToggle'
import styles from './Header.module.css'

interface HeaderProps {
  onOpenSettings: () => void
  /** Ref to the Settings button, used as the focus fallback for the dialog. */
  settingsRef?: Ref<HTMLButtonElement>
  /** Extra controls rendered before Settings (e.g. the Sync control). */
  actions?: ReactNode
}

function Header({ onOpenSettings, settingsRef, actions }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Contribution Dashboard</h1>
        <div className={styles.controls}>
          {actions}
          <button
            ref={settingsRef}
            type="button"
            className={styles.settings}
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export default Header
