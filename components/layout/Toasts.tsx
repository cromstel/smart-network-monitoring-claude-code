'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from '@/lib/utils/cn'

type Tone = 'info' | 'success' | 'error' | 'alert'
interface Toast {
  id: number
  title: string
  body?: string
  tone: Tone
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId++
      setToasts((ts) => [...ts.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.tone === 'alert' ? 8000 : 4500)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className={cn(
                'panel pointer-events-auto flex items-start gap-3 bg-surface p-3 shadow-xl',
                t.tone === 'alert' && 'border-warning/60',
                t.tone === 'error' && 'border-danger/60',
              )}
            >
              {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : t.tone === 'info' ? <Info className="mt-0.5 size-4 text-down" /> : <AlertTriangle className={cn('mt-0.5 size-4', t.tone === 'error' ? 'text-danger' : 'text-warning')} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body ? <p className="mt-0.5 text-xs text-muted">{t.body}</p> : null}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
