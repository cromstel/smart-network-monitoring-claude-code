import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] uppercase leading-none tracking-wide', {
  variants: {
    tone: {
      neutral: 'border-border bg-surface-2 text-muted',
      accent: 'border-accent/40 bg-accent/10 text-accent',
      success: 'border-success/40 bg-success/10 text-success',
      warning: 'border-warning/40 bg-warning/10 text-warning',
      danger: 'border-danger/40 bg-danger/10 text-danger',
      down: 'border-down/40 bg-down/10 text-down',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
