export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Position {
  left: number
  top: number
}

const GAP = 8

/**
 * Places a tooltip of `size` next to the `anchor` rect (viewport coordinates):
 * centered above it, flipped below when there is no room above, and always
 * kept inside the viewport.
 */
export function clampToViewport(anchor: Rect, size: Size, viewport: Size, gap = GAP): Position {
  const maxLeft = Math.max(0, viewport.width - size.width)
  const maxTop = Math.max(0, viewport.height - size.height)

  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - size.width / 2, 0), maxLeft)

  const above = anchor.top - size.height - gap
  const below = anchor.top + anchor.height + gap
  const top = above >= 0 ? above : below
  return { left, top: Math.min(Math.max(top, 0), maxTop) }
}
