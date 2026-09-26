'use client'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils/cn'

export function Switch({ className, ...props }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-2 transition-colors data-[state=checked]:border-accent/60 data-[state=checked]:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-muted transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent data-[state=checked]:shadow-[0_0_8px_rgb(var(--accent)/0.8)]" />
    </SwitchPrimitive.Root>
  )
}
