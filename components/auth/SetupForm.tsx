'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { apiFetch, fieldErrors } from '@/lib/hooks/api'

const schema = z
  .object({
    name: z.string().trim().max(255),
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(10, 'Use at least 10 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })
type Values = z.infer<typeof schema>

export function SetupForm() {
  const router = useRouter()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirm: '' } })
  const e = form.formState.errors

  const submit = form.handleSubmit(async (v) => {
    try {
      await apiFetch('/api/setup', { method: 'POST', json: { email: v.email, password: v.password, name: v.name || null } })
      router.replace('/')
      router.refresh()
    } catch (err) {
      const fe = fieldErrors(err)
      for (const [k, m] of Object.entries(fe)) form.setError(k as keyof Values, { message: m })
      if (Object.keys(fe).length === 0) form.setError('root', { message: err instanceof Error ? err.message : 'Setup failed' })
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" autoComplete="name" {...form.register('name')} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" aria-invalid={!!e.email} {...form.register('email')} />
        <FieldError message={e.email?.message} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...form.register('password')} />
        <FieldError message={e.password?.message} />
      </div>
      <div>
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!e.confirm} {...form.register('confirm')} />
        <FieldError message={e.confirm?.message} />
      </div>
      <FieldError message={e.root?.message} />
      <Button type="submit" variant="primary" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Creating…' : 'Create admin & continue'}
      </Button>
    </form>
  )
}
