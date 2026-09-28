'use client'
import { useSyncExternalStore } from 'react'

export interface ThemeColors {
  down: string
  up: string
  accent: string
  grid: string
  muted: string
  surface: string
}

const FALLBACK: ThemeColors = { down: 'rgb(56 189 248)', up: 'rgb(251 191 36)', accent: 'rgb(62 230 176)', grid: 'rgb(33 44 61)', muted: 'rgb(128 142 164)', surface: 'rgb(12 17 25)' }

function read(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => `rgb(${s.getPropertyValue(name).trim()})`
  return { down: v('--down'), up: v('--up'), accent: v('--accent'), grid: v('--border'), muted: v('--muted'), surface: v('--surface') }
}

// Cached snapshot: useSyncExternalStore requires getSnapshot to return a stable
// reference until the observed source (the <html> class attribute) actually changes.
let snapshot: ThemeColors | null = null

function getSnapshot(): ThemeColors {
  if (snapshot === null) snapshot = read()
  return snapshot
}

function subscribe(onStoreChange: () => void): () => void {
  const obs = new MutationObserver(() => {
    snapshot = null
    onStoreChange()
  })
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => {
    obs.disconnect()
    snapshot = null
  }
}

/** SVG attributes cannot resolve CSS variables reliably; resolve them and follow theme changes. */
export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getSnapshot, () => FALLBACK)
}
