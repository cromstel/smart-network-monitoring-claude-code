'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/hooks/api'

/** Only same-origin paths are honoured, so ?next= cannot redirect off-site. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    try {
      await apiFetch('/api/auth/login', { method: 'POST', json: { email: data.get('email'), password: data.get('password') } })
      router.replace(safeNext(params.get('next')))
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FieldError message={error ?? undefined} />
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
