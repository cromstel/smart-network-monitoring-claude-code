'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, PlugZap, Save } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/AppShell'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/input'
import { ErrorState, SkeletonRows } from '@/components/ui/states'
import { fieldErrors } from '@/lib/hooks/api'
import { useRouterConfig, useRouterStatus, useSaveRouterConfig, useTestRouter } from '@/lib/hooks/queries'
import { ROUTER_TYPES, type RouterConfigDTO } from '@/lib/types'
import { isValidIpv4 } from '@/lib/utils/network'
import { formatRelativeTime } from '@/lib/utils/format'

const schema = z.object({
  routerType: z.enum(ROUTER_TYPES),
  routerName: z.string().trim().max(255),
  routerIp: z.string().trim().refine(isValidIpv4, 'Enter the router’s IPv4 address.'),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1, 'Required'),
  password: z.string().max(255),
})
type Values = z.infer<typeof schema>

const TYPE_LABELS: Record<string, string> = { asus: 'ASUS (AsusWRT)', tplink: 'TP-Link — reachability only', netgear: 'Netgear — reachability only', generic: 'Other — reachability only' }

function StatusCard() {
  const s = useRouterStatus()
  return (
    <Card>
      <CardHeader title="Status" />
      <CardBody className="space-y-3 text-sm">
        {s.isPending ? (
          <SkeletonRows rows={3} />
        ) : s.isError ? (
          <ErrorState compact error={s.error} onRetry={() => void s.refetch()} />
        ) : !s.data.configured ? (
          <p className="text-muted">No router configured. Discovery uses the scanner chosen by <code className="num text-fg">SCANNER_MODE</code>, falling back to ARP.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="label-caps">Connection</span>
              <Badge tone={s.data.reachable ? 'success' : 'danger'}>{s.data.reachable ? 'reachable' : 'unreachable'}</Badge>
            </div>
            <div className="flex items-center justify-between"><span className="label-caps">Model</span><span className="num text-xs">{s.data.modelNumber ?? '—'}</span></div>
            <div className="flex items-center justify-between"><span className="label-caps">Firmware</span><span className="num text-xs">{s.data.firmwareVersion ?? '—'}</span></div>
            <div className="flex items-center justify-between"><span className="label-caps">Last success</span><span className="num text-xs">{s.data.lastSuccessAt ? formatRelativeTime(s.data.lastSuccessAt) : 'never'}</span></div>
            {!s.data.reachable ? <p className="text-xs text-muted">The dashboard keeps working; discovery falls back to ARP until the router answers again.</p> : null}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function ConfigForm({ config }: { config: RouterConfigDTO | null }) {
  const save = useSaveRouterConfig()
  const test = useTestRouter()
  const toast = useToast()
  const form = useForm<z.input<typeof schema>, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      routerType: config?.routerType ?? 'asus',
      routerName: config?.routerName ?? '',
      routerIp: config?.routerIp ?? '192.168.1.1',
      port: config?.port ?? 80,
      username: config?.username ?? 'admin',
      password: '',
    },
  })
  const errors = form.formState.errors

  const body = (v: Values) => ({ routerType: v.routerType, routerName: v.routerName || null, routerIp: v.routerIp, port: v.port, username: v.username, ...(v.password ? { password: v.password } : {}) })
  const applyErrors = (err: unknown) => {
    for (const [k, m] of Object.entries(fieldErrors(err))) form.setError(k as keyof Values, { message: m })
  }

  const onSave = form.handleSubmit((v) =>
    save.mutate(body(v), {
      onSuccess: () => {
        form.setValue('password', '')
        toast({ tone: 'success', title: 'Router saved', body: 'The password is encrypted at rest and never sent back.' })
      },
      onError: (e) => {
        applyErrors(e)
        toast({ tone: 'error', title: 'Could not save', body: e instanceof Error ? e.message : undefined })
      },
    }),
  )
  const onTest = form.handleSubmit((v) =>
    test.mutate(body(v), {
      onSuccess: (r) => toast({ tone: r.reachable ? 'success' : 'error', title: r.reachable ? `Connected${r.modelNumber ? ` to ${r.modelNumber}` : ''}` : 'Connection failed', body: r.message }),
      onError: (e) => {
        applyErrors(e)
        toast({ tone: 'error', title: 'Test failed', body: e instanceof Error ? e.message : undefined })
      },
    }),
  )

  return (
    <Card>
      <CardHeader title="Configuration" subtitle="Admin only" />
      <CardBody>
        <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <Label htmlFor="routerType">Router type</Label>
            <Select id="routerType" {...form.register('routerType')}>
              {ROUTER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="routerName">Name</Label>
            <Input id="routerName" placeholder="Living room router" {...form.register('routerName')} />
          </div>
          <div>
            <Label htmlFor="routerIp">IP address</Label>
            <Input id="routerIp" className="num" aria-invalid={!!errors.routerIp} {...form.register('routerIp')} />
            <FieldError message={errors.routerIp?.message} />
          </div>
          <div>
            <Label htmlFor="port">Port</Label>
            <Input id="port" type="number" className="num" aria-invalid={!!errors.port} {...form.register('port')} />
            <FieldError message={errors.port?.message} />
          </div>
          <div>
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="off" aria-invalid={!!errors.username} {...form.register('username')} />
            <FieldError message={errors.username?.message} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" placeholder={config?.hasPassword ? '•••••••• (unchanged)' : ''} aria-invalid={!!errors.password} {...form.register('password')} />
            <FieldError message={errors.password?.message} />
            <FieldHint><Lock className="mr-1 inline size-3" />Encrypted with AES-256-GCM. Leave empty to keep the stored one.</FieldHint>
          </div>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <Button type="button" onClick={() => void onTest()} disabled={test.isPending}><PlugZap /> {test.isPending ? 'Testing…' : 'Test connection'}</Button>
            <Button type="submit" variant="primary" disabled={save.isPending}><Save /> {save.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

export function RouterView() {
  const isAdmin = useCan(['ADMIN'])
  const config = useRouterConfig(isAdmin)
  return (
    <>
      <PageHeader eyebrow="Integration" title="Router" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {!isAdmin ? (
            <Card><CardBody className="text-sm text-muted">Only an admin can view or change the router configuration.</CardBody></Card>
          ) : config.isPending ? (
            <Card><CardBody><SkeletonRows rows={4} /></CardBody></Card>
          ) : config.isError ? (
            <Card><ErrorState error={config.error} onRetry={() => void config.refetch()} /></Card>
          ) : (
            <ConfigForm config={config.data} />
          )}
        </div>
        <StatusCard />
      </div>
    </>
  )
}
