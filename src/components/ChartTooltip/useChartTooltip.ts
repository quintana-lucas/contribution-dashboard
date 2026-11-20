import { useCallback, useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent, TouchEvent } from 'react'

export const HOVER_DELAY_MS = 100

export interface OpenTooltip<T> {
  anchor: HTMLElement
  data: T
}

export interface TooltipTargetProps {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onTouchStart: (event: TouchEvent<HTMLElement>) => void
}

/**
 * Interaction state for a chart tooltip. Spread `bind(data)` on each row or
 * bar; render `<ChartTooltip anchor={open.anchor} ...>` while `open` is set.
 * Hover opens after a short delay, focus opens immediately, Escape closes, a
 * touch opens and a touch elsewhere closes.
 */
export function useChartTooltip<T>() {
  const [open, setOpen] = useState<OpenTooltip<T> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  const close = useCallback(() => {
    clearTimer()
    setOpen(null)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  const anchor = open?.anchor
  useEffect(() => {
    if (!anchor) return
    const onOutside = (event: Event) => {
      if (!anchor.contains(event.target as Node)) close()
    }
    document.addEventListener('touchstart', onOutside)
    return () => document.removeEventListener('touchstart', onOutside)
  }, [anchor, close])

  const bind = useCallback(
    (data: T): TooltipTargetProps => ({
      onMouseEnter: (event) => {
        const target = event.currentTarget
        clearTimer()
        timer.current = setTimeout(() => setOpen({ anchor: target, data }), HOVER_DELAY_MS)
      },
      onMouseLeave: close,
      onFocus: (event) => {
        clearTimer()
        setOpen({ anchor: event.currentTarget, data })
      },
      onBlur: close,
      onKeyDown: (event) => {
        if (event.key === 'Escape') close()
      },
      onTouchStart: (event) => {
        clearTimer()
        setOpen({ anchor: event.currentTarget, data })
      },
    }),
    [clearTimer, close],
  )

  return { open, bind, close }
}
