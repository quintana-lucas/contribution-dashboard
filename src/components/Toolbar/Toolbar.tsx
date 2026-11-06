import type { Period } from '../../api/dashboard'
import { useDashboard } from '../DashboardProvider'
import styles from './Toolbar.module.css'

const PERIODS: Period[] = [7, 30, 90]

export default function Toolbar() {
  const { status, entries, selection, setSelection, period, setPeriod, subline } = useDashboard()

  // No linked repos: the toolbar is hidden, not disabled (AC4).
  if (status === 'ready' && entries.length === 0) return null

  if (status !== 'ready') {
    return (
      <div className={styles.toolbar} role="group" aria-label="Dashboard filters">
        <p className={styles.subline} role="status" data-state={status}>
          {status === 'loading'
            ? 'Loading repository data…'
            : 'Could not load repository data. Check that the local server is running, then reload the page.'}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.toolbar} role="group" aria-label="Dashboard filters">
      <div className={styles.controls}>
        <div className={styles.field}>
          <label htmlFor="toolbar-repo" className={styles.label}>
            Repository
          </label>
          <select
            id="toolbar-repo"
            className={styles.select}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="all">All repositories</option>
            {entries.map((e) => (
              <option key={e.repo} value={e.repo}>
                {e.repo}
              </option>
            ))}
          </select>
        </div>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Period</legend>
          <div className={styles.segments}>
            {PERIODS.map((p) => (
              <label key={p} className={styles.segment}>
                <input
                  type="radio"
                  name="toolbar-period"
                  className={styles.radio}
                  value={p}
                  checked={period === p}
                  onChange={() => setPeriod(p)}
                />
                {p} days
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className={styles.subline} role="status">
        {subline}
      </p>
    </div>
  )
}
