import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'

// Shared helpers for testing visx charts in jsdom, which has no layout engine.
// The ResizeObserver mock is here because @visx/responsive (ParentSize) needs
// one; if a chart does not use it, simply do not call it.

export interface Size {
  width: number
  height: number
}

type ObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void

function entryFor(target: Element, { width, height }: Size): ResizeObserverEntry {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }
  const box = [{ inlineSize: width, blockSize: height }]
  return {
    target,
    contentRect: { ...rect, toJSON: () => rect },
    borderBoxSize: box,
    contentBoxSize: box,
    devicePixelContentBoxSize: box,
  } as ResizeObserverEntry
}

/**
 * Installs a fake `ResizeObserver` that reports `size` as soon as an element is
 * observed. Returns a function that restores the previous global.
 */
export function mockResizeObserver(size: Size = { width: 600, height: 300 }): () => void {
  const previous = globalThis.ResizeObserver

  class FakeResizeObserver implements ResizeObserver {
    private readonly callback: ObserverCallback
    constructor(callback: ObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      this.callback([entryFor(target, size)], this)
    }
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  return () => {
    globalThis.ResizeObserver = previous
  }
}

/**
 * Makes every element's `getBoundingClientRect` return the given rect (for
 * layout-dependent code such as tooltip placement). Returns a restore function.
 */
export function mockElementRect(rect: Partial<DOMRect> = {}): () => void {
  const base = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }
  const full = {
    ...base,
    right: rect.right ?? base.left + base.width,
    bottom: rect.bottom ?? base.top + base.height,
  }
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect
  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

/**
 * Renders a chart with a fake ResizeObserver reporting `size`. `unmount` also
 * restores the global.
 */
export function renderChart(ui: ReactElement, size: Size = { width: 600, height: 300 }): RenderResult {
  const restore = mockResizeObserver(size)
  const result = render(ui)
  const unmount = result.unmount
  return {
    ...result,
    unmount: () => {
      unmount()
      restore()
    },
  }
}
