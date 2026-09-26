import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...props} />
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="label-caps !text-fg/80">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
