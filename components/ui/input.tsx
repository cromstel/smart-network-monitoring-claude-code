import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils/cn'

const field =
  'h-10 w-full rounded border border-border bg-bg/60 px-3 text-sm text-fg placeholder:text-muted/70 transition-colors focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-danger/70'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, className)} {...props} />
))
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(field, 'appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%23889' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...props}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return <LabelPrimitive.Root className={cn('label-caps mb-1.5 block', className)} {...props} />
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {message}
    </p>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted">{children}</p>
}
