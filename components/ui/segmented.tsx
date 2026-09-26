'use client'
import { cn } from '@/lib/utils/cn'

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border border-border bg-bg/60 p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-sm px-2.5 py-1 font-mono text-xs uppercase transition-colors',
            value === opt ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.4)]' : 'text-muted hover:text-fg',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
