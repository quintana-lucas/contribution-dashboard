import BarList from '../BarList'
import type { BarListItem } from '../BarList'
import { useDashboard } from '../DashboardProvider'
import Widget from '../Widget'
import styles from './ContributionsWidget.module.css'

interface ContributionsWidgetProps {
  onOpenSettings: () => void
}

function prText(name: string, n: number) {
  return `${name}: ${n} merged pull request${n === 1 ? '' : 's'}`
}

// Widget 1: merged pull requests per person. Reads only the dashboard context (local data).
function ContributionsWidget({ onOpenSettings }: ContributionsWidgetProps) {
  const { status, entries, selection, period, contributions } = useDashboard()
  const scope = selection === 'all' ? 'All repositories' : selection
  const hint = `Merged pull requests per person · ${scope} · last ${period} days`

  let body = null
  if (status === 'loading') {
    body = <p className={styles.muted}>Loading…</p>
  } else if (status === 'ready') {
    const inScope = selection === 'all' ? entries : entries.filter((e) => e.repo === selection)
    if (!inScope.some((e) => e.data !== null)) {
      body = (
        <div className={styles.empty}>
          <p className={styles.muted}>No data yet. Sync a linked repository to see contributions.</p>
          <button type="button" className={styles.button} onClick={onOpenSettings}>
            Open settings
          </button>
        </div>
      )
    } else {
      const { people, others } = contributions()
      if (people.length === 0) {
        body = (
          <p className={styles.muted}>No merged pull requests in the last {period} days.</p>
        )
      } else {
        const items: BarListItem[] = people.map((p) => ({
          key: p.login.toLowerCase(),
          label: p.login,
          value: p.count,
          srText: prText(p.login, p.count),
        }))
        if (others) {
          const label = `Others (${others.people} people)`
          items.push({
            key: '__others__',
            label,
            value: others.count,
            muted: true,
            srText: prText(label, others.count),
          })
        }
        body = (
          <BarList
            label={`Merged pull requests per person, ${scope}, last ${period} days`}
            items={items}
          />
        )
      }
    }
  }

  return (
    <Widget title="Widget 1" hint={hint}>
      {body}
    </Widget>
  )
}

export default ContributionsWidget
