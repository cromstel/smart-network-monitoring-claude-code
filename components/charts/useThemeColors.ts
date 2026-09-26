'use client'
import { useEffect, useState } from 'react'

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

/** SVG attributes cannot resolve CSS variables reliably; resolve them and follow theme changes. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK)
  useEffect(() => {
    setColors(read())
    const obs = new MutationObserver(() => setColors(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return colors
}
