import ContributionsWidget from '../ContributionsWidget'
import Widget from '../Widget'
import styles from './WidgetGrid.module.css'

const placeholders = [
  { title: 'Widget 2', hint: 'Future: reviews' },
  { title: 'Widget 3', hint: 'Future: pull request activity' },
  { title: 'Widget 4', hint: 'Future: to be decided' },
]

interface WidgetGridProps {
  onOpenSettings: () => void
}

function WidgetGrid({ onOpenSettings }: WidgetGridProps) {
  return (
    <div className={styles.grid}>
      <ContributionsWidget onOpenSettings={onOpenSettings} />
      {placeholders.map((widget) => (
        <Widget key={widget.title} title={widget.title} hint={widget.hint} />
      ))}
    </div>
  )
}

export default WidgetGrid
