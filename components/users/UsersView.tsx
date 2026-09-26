'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/AppShell'
import { useCurrentUser } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/input'
import { ErrorState, SkeletonRows } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { fieldErrors } from '@/lib/hooks/api'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '@/lib/hooks/queries'
import { ROLES, type Role } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils/format'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  name: z.string().trim().max(255),
  password: z.string().min(10, 'Use at least 10 characters.'),
  role: z.enum(ROLES),
})
type Values = z.infer<typeof schema>

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, including users and the router',
  MEMBER: 'Read all, rename devices, manage own alerts',
  VIEWER: 'Read only',
}

function CreateUser() {
  const [open, setOpen] = useState(false)
  const create = useCreateUser()
  const toast = useToast()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', name: '', password: '', role: 'MEMBER' } })
  const e = form.formState.errors
  const submit = form.handleSubmit((v) =>
    create.mutate(
      { ...v, name: v.name || null },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: `Added ${v.email}` })
          form.reset()
          setOpen(false)
        },
        onError: (err) => {
          const fe = fieldErrors(err)
          for (const [k, m] of Object.entries(fe)) form.setError(k as keyof Values, { message: m })
          if (Object.keys(fe).length === 0) form.setError('email', { message: err instanceof Error ? err.message : 'Could not add user' })
        },
      },
    ),
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><UserPlus /> Add user</Button>
      </DialogTrigger>
      <DialogContent title="Add user">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" autoComplete="off" aria-invalid={!!e.email} {...form.register('email')} />
            <FieldError message={e.email?.message} />
          </div>
          <div>
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" {...form.register('name')} />
          </div>
          <div>
            <Label htmlFor="u-password">Temporary password</Label>
            <Input id="u-password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...form.register('password')} />
            <FieldError message={e.password?.message} />
            <FieldHint>They can change it under Settings → Account.</FieldHint>
          </div>
          <div>
            <Label htmlFor="u-role">Role</Label>
            <Select id="u-role" {...form.register('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{r} — {ROLE_HELP[r]}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>Add user</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPassword({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const update = useUpdateUser()
  const toast = useToast()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 10) return setError('Use at least 10 characters.')
    update.mutate(
      { id, password },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: `Password reset for ${email}`, body: 'Their existing sessions were signed out.' })
          setPassword('')
          setOpen(false)
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not reset password'),
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Reset password for ${email}`} title="Reset password"><KeyRound /></Button>
      </DialogTrigger>
      <DialogContent title="Reset password" description={`Set a new password for ${email}. They will be signed out everywhere.`}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor={`pw-${id}`}>New password</Label>
            <Input id={`pw-${id}`} type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(undefined) }} aria-invalid={!!error} />
            <FieldError message={error} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={update.isPending}>Reset password</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersView() {
  const me = useCurrentUser()
  const users = useUsers()
  const update = useUpdateUser()
  const del = useDeleteUser()
  const toast = useToast()
  const onError = (err: unknown) => toast({ tone: 'error', title: 'Not changed', body: err instanceof Error ? err.message : undefined })

  return (
    <>
      <PageHeader eyebrow="Access" title="Users"><CreateUser /></PageHeader>
      <Card className="overflow-hidden">
        {users.isPending ? (
          <div className="p-4"><SkeletonRows rows={3} /></div>
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : (
          <ul className="divide-y divide-border/60">
            {users.data.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-9 place-items-center rounded border border-border bg-surface-2 font-display text-sm font-bold uppercase">{(u.name ?? u.email).slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {u.name ?? u.email} {u.id === me.id ? <Badge tone="accent">you</Badge> : null} {!u.isActive ? <Badge tone="danger">disabled</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{u.email} · last sign-in {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'never'}</p>
                </div>
                <Select aria-label={`Role for ${u.email}`} value={u.role} className="w-32" disabled={update.isPending} onChange={(e) => update.mutate({ id: u.id, role: e.target.value }, { onError })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
                <Switch checked={u.isActive} disabled={u.id === me.id} onCheckedChange={(v) => update.mutate({ id: u.id, isActive: v }, { onError })} aria-label={u.isActive ? 'Disable user' : 'Enable user'} />
                {u.id !== me.id ? <ResetPassword id={u.id} email={u.email} /> : null}
                <Button size="icon" variant="ghost" disabled={u.id === me.id} onClick={() => del.mutate(u.id, { onError })} aria-label={`Delete ${u.email}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
