import ContributionsWidget from '../ContributionsWidget'
import PrActivityWidget from '../PrActivityWidget'
import ReviewsWidget from '../ReviewsWidget'
import Widget from '../Widget'
import styles from './WidgetGrid.module.css'

const placeholders = [
  { title: 'Widget 4', hint: 'Future: to be decided' },
]

interface WidgetGridProps {
  onOpenSettings: () => void
}

function WidgetGrid({ onOpenSettings }: WidgetGridProps) {
  return (
    <div className={styles.grid}>
      <ContributionsWidget onOpenSettings={onOpenSettings} />
      <ReviewsWidget onOpenSettings={onOpenSettings} />
      <PrActivityWidget onOpenSettings={onOpenSettings} />
      {placeholders.map((widget) => (
        <Widget key={widget.title} title={widget.title} hint={widget.hint} />
      ))}
    </div>
  )
}

export default WidgetGrid
