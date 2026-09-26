import type { DeviceStatus } from '@/lib/types'
import { cn } from '@/lib/utils/cn'

const COLORS: Record<DeviceStatus, string> = {
  online: 'bg-success shadow-[0_0_8px_rgb(var(--success)/0.9)]',
  idle: 'bg-warning shadow-[0_0_6px_rgb(var(--warning)/0.7)]',
  offline: 'bg-muted/50',
}

export function StatusDot({ status, className }: { status: DeviceStatus; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      {status === 'online' ? <span className="absolute inset-0 animate-pulse-ring rounded-full bg-success/60" /> : null}
      <span className={cn('relative inline-block size-2 rounded-full', COLORS[status])} />
    </span>
  )
}

export function StatusLabel({ status }: { status: DeviceStatus }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide">
      <StatusDot status={status} />
      <span className={status === 'offline' ? 'text-muted' : status === 'idle' ? 'text-warning' : 'text-success'}>{status}</span>
    </span>
  )
}
