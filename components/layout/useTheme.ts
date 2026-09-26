'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '@/lib/types'
import { useSettings, useUpdateSettings } from '@/lib/hooks/queries'
import { useCan } from './SessionContext'

const KEY = 'snm-theme'

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage unavailable (private mode); the class still applies for this page view
  }
}

/** Theme persists to the user's settings (PRD F-53) and mirrors to localStorage to avoid a flash on load. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const settings = useSettings()
  const update = useUpdateSettings()
  const canWrite = useCan(['ADMIN', 'MEMBER'])
  const [theme, setLocal] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Theme | null
      if (stored) setLocal(stored)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (settings.data?.theme) {
      setLocal(settings.data.theme)
      apply(settings.data.theme)
    }
  }, [settings.data?.theme])

  const setTheme = useCallback(
    (t: Theme) => {
      setLocal(t)
      apply(t)
      if (canWrite) update.mutate({ theme: t })
    },
    [canWrite, update],
  )
  return { theme, setTheme }
}
