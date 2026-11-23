import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Measures the width in px of the element the returned ref is attached to.
 * `fallback` is used until a real width is known (no layout engine, e.g. jsdom).
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (w: number) => setWidth((prev) => (prev === w ? prev : w))
    read(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) read(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width || fallback] as const
}
