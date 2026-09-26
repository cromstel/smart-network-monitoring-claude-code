import { AlertTriangle, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-muted [&_svg]:size-7">{icon}</div> : null}
      <p className="font-display text-sm font-semibold">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 text-center', compact ? 'py-4' : 'px-6 py-10')}>
      <AlertTriangle className="size-6 text-danger" />
      <p className="text-sm font-medium">Couldn’t load this.</p>
      <p className="max-w-sm text-xs text-muted">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry} className="mt-1">
          <RotateCw /> Retry
        </Button>
      ) : null}
    </div>
  )
}
