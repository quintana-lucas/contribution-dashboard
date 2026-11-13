// "When" text for a pull request row. Pure: `now` is always passed in.
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Relative up to 6 days ("just now", "5 min ago", "3 h ago", "2 days ago"), then "Jun 3" / "Jun 3, 2025". */
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(iso)
  const diff = now.getTime() - date.getTime()
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  const days = Math.floor(diff / DAY)
  if (days <= 6) return days === 1 ? '1 day ago' : `${days} days ago`
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Full local date and time, for the `title` of the `time` element. */
export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Chart label for a day bucket, e.g. "Mon 9". */
export function dayLabel(d: Date): string {
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
}

/** Chart label for a week bucket (its start), e.g. "Jun 8". */
export function weekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
