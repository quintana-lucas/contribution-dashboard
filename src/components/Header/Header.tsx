import styles from './Header.module.css'

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Contribution Dashboard</h1>
        <div
          role="group"
          aria-label="Placeholder for future header controls"
          className={styles.slot}
        >
          Profile (coming soon)
        </div>
      </div>
    </header>
  )
}

export default Header
