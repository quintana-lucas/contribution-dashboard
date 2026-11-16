import ContributionsWidget from '../ContributionsWidget'
import PrActivityWidget from '../PrActivityWidget'
import ReviewsWidget from '../ReviewsWidget'
import WaitingWidget from '../WaitingWidget'
import styles from './WidgetGrid.module.css'

interface WidgetGridProps {
  onOpenSettings: () => void
}

function WidgetGrid({ onOpenSettings }: WidgetGridProps) {
  return (
    <div className={styles.grid}>
      <ContributionsWidget onOpenSettings={onOpenSettings} />
      <ReviewsWidget onOpenSettings={onOpenSettings} />
      <PrActivityWidget onOpenSettings={onOpenSettings} />
      <WaitingWidget onOpenSettings={onOpenSettings} />
    </div>
  )
}

export default WidgetGrid
