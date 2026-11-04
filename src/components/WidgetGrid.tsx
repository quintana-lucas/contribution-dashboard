import Widget from './Widget'
import styles from './WidgetGrid.module.css'

const widgets = [
  { title: 'Widget 1', hint: 'Future: contributions per person' },
  { title: 'Widget 2', hint: 'Future: reviews' },
  { title: 'Widget 3', hint: 'Future: pull request activity' },
  { title: 'Widget 4', hint: 'Future: to be decided' },
]

function WidgetGrid() {
  return (
    <div className={styles.grid}>
      {widgets.map((widget) => (
        <Widget key={widget.title} title={widget.title} hint={widget.hint} />
      ))}
    </div>
  )
}

export default WidgetGrid
