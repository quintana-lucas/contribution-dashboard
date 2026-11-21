import styles from './LinesDelta.module.css'

type LinesDeltaProps = {
  additions: number
  deletions: number
  layout?: 'inline' | 'columns'
  muteZero?: boolean
}

const formatter = new Intl.NumberFormat('en-US')

function LinesDelta({ additions, deletions, layout = 'inline', muteZero = true }: LinesDeltaProps) {
  const add = formatter.format(additions)
  const del = formatter.format(deletions)
  const root = layout === 'columns' ? `${styles.root} ${styles.columns}` : styles.root
  const figure = (tone: string, n: number) =>
    [styles.figure, muteZero && n === 0 ? styles.zero : tone].join(' ')
  return (
    <span role="img" aria-label={`${add} added, ${del} removed`} className={root}>
      <span className={figure(styles.add, additions)}>+{add}</span>
      <span className={figure(styles.del, deletions)}>{'−'}{del}</span>
    </span>
  )
}

export default LinesDelta
