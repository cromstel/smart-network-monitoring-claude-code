'use client'
/**
 * Subscribes to /api/events and turns each event into query invalidations. The payload is a
 * signal, not data: TanStack refetches, so there is one code path however an update arrives.
 * Reconnects with exponential backoff (1s → 30s) when the stream drops.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { bandwidthKeys, deviceKeys, healthKeys, notificationKeys } from './keys'

export type StreamState = 'connecting' | 'live' | 'reconnecting'

const EVENTS = ['device.connected', 'device.disconnected', 'device.updated', 'bandwidth.tick', 'alert.raised', 'scan.completed'] as const

export function useEventStream(onAlert?: (payload: { title?: string; priority?: string }) => void): StreamState {
  const qc = useQueryClient()
  const [state, setState] = useState<StreamState>('connecting')
  const onAlertRef = useRef(onAlert)
  onAlertRef.current = onAlert

  useEffect(() => {
    let source: EventSource | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const invalidate = (name: (typeof EVENTS)[number], data: string) => {
      switch (name) {
        case 'bandwidth.tick':
          void qc.invalidateQueries({ queryKey: bandwidthKeys.current() })
          void qc.invalidateQueries({ queryKey: [...bandwidthKeys.all, 'history', '1h'] })
          void qc.invalidateQueries({ queryKey: deviceKeys.all })
          break
        case 'scan.completed':
          void qc.invalidateQueries({ queryKey: healthKeys.all })
          void qc.invalidateQueries({ queryKey: [...bandwidthKeys.all, 'top'] })
          break
        case 'alert.raised':
          void qc.invalidateQueries({ queryKey: notificationKeys.all })
          try {
            onAlertRef.current?.(JSON.parse(data) as { title?: string; priority?: string })
          } catch {
            onAlertRef.current?.({})
          }
          break
        default:
          void qc.invalidateQueries({ queryKey: deviceKeys.all })
          void qc.invalidateQueries({ queryKey: bandwidthKeys.current() })
      }
    }

    const connect = () => {
      if (disposed) return
      source = new EventSource('/api/events')
      source.onopen = () => {
        retry = 0
        setState('live')
      }
      for (const name of EVENTS) source.addEventListener(name, (e) => invalidate(name, (e as MessageEvent<string>).data))
      source.onerror = () => {
        source?.close()
        source = null
        if (disposed) return
        setState('reconnecting')
        const delay = Math.min(30_000, 1000 * 2 ** retry++)
        timer = setTimeout(() => {
          // Anything may have changed while disconnected.
          void qc.invalidateQueries()
          connect()
        }, delay)
      }
    }
    connect()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      source?.close()
    }
  }, [qc])

  return state
}
