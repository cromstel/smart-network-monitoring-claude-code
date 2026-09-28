'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@/lib/types'
import { useSettings, useUpdateSettings } from '@/lib/hooks/queries'
import { useCan } from './SessionContext'

const KEY = 'snm-theme'
const DEFAULT: Theme = 'dark'

/**
 * Theme lives in an external store (localStorage) so it can be read after hydration
 * without a setState-in-effect cascade: useSyncExternalStore renders from the server
 * snapshot during SSR/hydration, then switches to the stored value.
 */
let cached: Theme | null = null
const listeners = new Set<() => void>()

function readStore(): Theme {
  if (cached === null) {
    try {
      cached = (localStorage.getItem(KEY) as Theme | null) ?? DEFAULT
    } catch {
      cached = DEFAULT
    }
  }
  return cached
}

function writeStore(theme: Theme): void {
  cached = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage unavailable (private mode); the class still applies for this page view
  }
  for (const listener of listeners) listener()
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Theme persists to the user's settings (PRD F-53) and mirrors to localStorage to avoid a flash on load. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const settings = useSettings()
  const update = useUpdateSettings()
  const canWrite = useCan(['ADMIN', 'MEMBER'])
  const theme = useSyncExternalStore(subscribe, readStore, () => DEFAULT)

  // The saved setting wins once the query resolves (or changes elsewhere); adopt it
  // and refresh the localStorage mirror + document class.
  const serverTheme = settings.data?.theme
  useEffect(() => {
    if (serverTheme && serverTheme !== readStore()) {
      writeStore(serverTheme)
      apply(serverTheme)
    }
  }, [serverTheme])

  const setTheme = useCallback(
    (t: Theme) => {
      writeStore(t)
      apply(t)
      if (canWrite) update.mutate({ theme: t })
    },
    [canWrite, update],
  )
  return { theme, setTheme }
}
