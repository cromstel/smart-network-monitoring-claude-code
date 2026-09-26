/**
 * In-process event bus. The scanner and alert engine publish; the SSE route subscribes.
 * Cached on globalThis because instrumentation.ts (publisher) and route handlers (subscribers)
 * are separate bundles — without it they would each get their own emitter and never meet.
 */
import { EventEmitter } from 'node:events'
import type { ServerEventName } from '@/lib/types'

export interface BusEvent {
  name: ServerEventName | InternalEventName
  data: Record<string, unknown>
  /** When set, only this user's streams receive the event (alert.raised). */
  userId?: string
}

/** Server-side only; never forwarded to browsers. */
export type InternalEventName = 'settings.changed' | 'router.changed'

export const PUBLIC_EVENTS: ReadonlySet<string> = new Set<ServerEventName>([
  'device.connected',
  'device.disconnected',
  'device.updated',
  'bandwidth.tick',
  'alert.raised',
  'scan.completed',
])

const g = globalThis as unknown as { __snmBus?: EventEmitter }
const emitter: EventEmitter = g.__snmBus ?? new EventEmitter()
emitter.setMaxListeners(1000)
g.__snmBus = emitter

const CHANNEL = 'event'

export function publish(name: BusEvent['name'], data: Record<string, unknown>, opts: { userId?: string } = {}): void {
  const event: BusEvent = { name, data, ...(opts.userId ? { userId: opts.userId } : {}) }
  emitter.emit(CHANNEL, event)
}

export function subscribe(listener: (event: BusEvent) => void): () => void {
  emitter.on(CHANNEL, listener)
  return () => {
    emitter.off(CHANNEL, listener)
  }
}

export function listenerCount(): number {
  return emitter.listenerCount(CHANNEL)
}

/** Should a given user's stream receive this event? */
export function isVisibleTo(event: BusEvent, userId: string): boolean {
  if (!PUBLIC_EVENTS.has(event.name)) return false
  return event.userId === undefined || event.userId === userId
}
