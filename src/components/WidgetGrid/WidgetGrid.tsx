import ContributionsWidget from '../ContributionsWidget'
import ReviewsWidget from '../ReviewsWidget'
import WaitingWidget from '../WaitingWidget'
import Widget from '../Widget'
import styles from './WidgetGrid.module.css'

const placeholders = [
  { title: 'Widget 3', hint: 'Future: pull request activity' },
]

interface WidgetGridProps {
  onOpenSettings: () => void
}

function WidgetGrid({ onOpenSettings }: WidgetGridProps) {
  return (
    <div className={styles.grid}>
      <ContributionsWidget onOpenSettings={onOpenSettings} />
      <ReviewsWidget onOpenSettings={onOpenSettings} />
      {placeholders.map((widget) => (
        <Widget key={widget.title} title={widget.title} hint={widget.hint} />
      ))}
      <WaitingWidget onOpenSettings={onOpenSettings} />
    </div>
  )
}

export default WidgetGrid
