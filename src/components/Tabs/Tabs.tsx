import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface TabItem {
  key: string
  label: string
  content: ReactNode
}

interface TabsProps {
  label: string
  tabs: TabItem[]
}

export default function Tabs({ label, tabs }: TabsProps) {
  const baseId = useId()
  const [selected, setSelected] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const tabId = (i: number) => `${baseId}-tab-${tabs[i].key}`
  const panelId = (i: number) => `${baseId}-panel-${tabs[i].key}`

  const select = (i: number) => {
    setSelected(i)
    tabRefs.current[i]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = tabs.length - 1
    let next: number
    switch (e.key) {
      case 'ArrowRight':
        next = i === last ? 0 : i + 1
        break
      case 'ArrowLeft':
        next = i === 0 ? last : i - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    e.preventDefault()
    select(next)
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={tabId(i)}
            aria-selected={i === selected}
            aria-controls={panelId(i)}
            tabIndex={i === selected ? 0 : -1}
            className={styles.tab}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={panelId(i)}
          aria-labelledby={tabId(i)}
          hidden={i !== selected}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
