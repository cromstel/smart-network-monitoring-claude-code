import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-display text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent/85 shadow-[0_0_0_1px_rgb(var(--accent)/0.4),0_0_18px_-4px_rgb(var(--accent)/0.6)]',
        secondary: 'border border-border bg-surface-2 text-fg hover:border-accent/60 hover:text-accent',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-danger/50 bg-danger/10 text-danger hover:bg-danger/20',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
