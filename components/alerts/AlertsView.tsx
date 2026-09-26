'use client'
import * as Tabs from '@radix-ui/react-tabs'
import { BellOff, Check, CheckCheck, ChevronLeft, ChevronRight, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/input'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import {
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useDevices,
  useMarkAllRead,
  useMarkNotification,
  useNotifications,
  useUpdateAlertRule,
} from '@/lib/hooks/queries'
import { fieldErrors } from '@/lib/hooks/api'
import type { AlertType } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime } from '@/lib/utils/format'

const ALERT_LABELS: Record<AlertType, { title: string; blurb: string }> = {
  unknown_device: { title: 'Unknown device', blurb: 'An unnamed device joins the network' },
  bandwidth_exceeded: { title: 'Bandwidth threshold', blurb: 'Combined up + down exceeds a limit' },
  device_offline: { title: 'Device offline', blurb: 'A device stops responding' },
}

const PAGE_SIZE = 25

function ActivityLog() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const q = useNotifications({ isRead: filter === 'unread' ? false : undefined, type: type || undefined, page, pageSize: PAGE_SIZE })
  const mark = useMarkNotification()
  const markAll = useMarkAllRead()
  const total = q.data?.pagination.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select aria-label="Show" value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | 'unread'); setPage(1) }} className="w-36">
          <option value="all">All</option>
          <option value="unread">Unread</option>
        </Select>
        <Select aria-label="Severity" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className="w-40">
          <option value="">Any severity</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
          <option value="error">Error</option>
        </Select>
        <span className="num ml-1 text-xs text-muted">{q.data ? `${q.data.unreadCount} unread` : ''}</span>
        <Button size="sm" className="ml-auto" onClick={() => markAll.mutate()} disabled={markAll.isPending || !q.data?.unreadCount}>
          <CheckCheck /> Mark all read
        </Button>
      </div>
      {q.isPending ? (
        <div className="p-4"><SkeletonRows rows={6} /></div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState icon={<BellOff />} title={filter === 'unread' ? 'Nothing unread' : 'No alerts yet'}>Alerts are delivered only to you, from your own rules and notification settings.</EmptyState>
      ) : (
        <>
          <ul className={cn('divide-y divide-border/60', q.isPlaceholderData && 'opacity-60')}>
            {q.data.data.map((n) => (
              <li key={n.id} className={cn('flex gap-3 px-4 py-3', !n.isRead && 'bg-warning/[0.03]')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.isRead ? 'bg-muted/40' : n.priority === 'high' ? 'bg-warning shadow-[0_0_6px_rgb(var(--warning))]' : 'bg-down')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm', !n.isRead && 'font-semibold')}>{n.title}</p>
                    {n.priority === 'high' ? <Badge tone="warning">high</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="num text-[11px] text-muted" title={new Date(n.createdAt).toLocaleString()}>{formatRelativeTime(n.createdAt)}</span>
                    {n.deviceId ? <Link href={`/devices/${n.deviceId}`} className="font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">device</Link> : null}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => mark.mutate({ id: n.id, isRead: !n.isRead })} aria-label={n.isRead ? 'Mark as unread' : 'Acknowledge'} title={n.isRead ? 'Mark as unread' : 'Acknowledge'}>
                  <Check className={n.isRead ? 'text-success' : ''} />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="num text-xs text-muted">page {page} of {pages}</p>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function NewRuleDialog() {
  const [open, setOpen] = useState(false)
  const [alertType, setAlertType] = useState<AlertType>('bandwidth_exceeded')
  const [deviceId, setDeviceId] = useState('')
  const [threshold, setThreshold] = useState('50')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const devices = useDevices({ sort: 'name', order: 'asc', pageSize: 100 })
  const create = useCreateAlertRule()
  const toast = useToast()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = Number(threshold)
    if (alertType === 'bandwidth_exceeded' && (!Number.isFinite(t) || t <= 0)) {
      setErrors({ threshold: 'Enter a positive number of Mbps.' })
      return
    }
    create.mutate(
      { alertType, deviceId: deviceId || null, threshold: alertType === 'bandwidth_exceeded' ? t : null, isActive: true },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: 'Alert rule created' })
          setOpen(false)
          setErrors({})
        },
        onError: (err) => setErrors({ form: err instanceof Error ? err.message : 'Could not create rule', ...fieldErrors(err) }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus /> New rule</Button>
      </DialogTrigger>
      <DialogContent title="New alert rule" description="Rules are yours alone — nobody else is notified by them.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-2">
            {(Object.keys(ALERT_LABELS) as AlertType[]).map((t) => (
              <label key={t} className={cn('flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 transition-colors', alertType === t ? 'border-accent/60 bg-accent/5' : 'border-border hover:border-muted')}>
                <input type="radio" name="alertType" value={t} checked={alertType === t} onChange={() => setAlertType(t)} className="mt-1 accent-[rgb(var(--accent))]" />
                <span>
                  <span className="block text-sm font-medium">{ALERT_LABELS[t].title}</span>
                  <span className="block text-xs text-muted">{ALERT_LABELS[t].blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <div>
            <Label htmlFor="rule-device">Device</Label>
            <Select id="rule-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">All devices</option>
              {(devices.data?.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.displayName} — {d.ipAddress}</option>)}
            </Select>
            <FieldError message={errors.deviceId} />
            {alertType === 'device_offline' && !deviceId ? <FieldHint>For all devices, only named devices raise offline alerts.</FieldHint> : null}
          </div>
          {alertType === 'bandwidth_exceeded' ? (
            <div>
              <Label htmlFor="rule-threshold">Threshold (Mbps)</Label>
              <Input id="rule-threshold" type="number" min={1} step="any" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-invalid={!!errors.threshold} />
              <FieldError message={errors.threshold} />
              <FieldHint>Fires at most once every 15 minutes per device.</FieldHint>
            </div>
          ) : null}
          <FieldError message={errors.form} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create rule'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Rules() {
  const rules = useAlertRules()
  const devices = useDevices({ sort: 'name', order: 'asc', pageSize: 100 })
  const update = useUpdateAlertRule()
  const del = useDeleteAlertRule()
  const canWrite = useCan(['ADMIN', 'MEMBER'])
  const names = new Map((devices.data?.data ?? []).map((d) => [d.id, d.displayName]))

  return (
    <Card className="overflow-hidden">
      {rules.isPending ? (
        <div className="p-4"><SkeletonRows rows={3} /></div>
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="No rules yet" action={canWrite ? <NewRuleDialog /> : undefined}>
          Your notification settings already cover unknown devices and named devices going offline. Rules add device-specific and bandwidth alerts.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border/60">
          {rules.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {ALERT_LABELS[r.alertType].title}
                  {r.threshold !== null ? <span className="num text-up"> &gt; {r.threshold} Mbps</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {r.deviceId ? names.get(r.deviceId) ?? 'Specific device' : 'All devices'} · fired {r.triggerCount}×{r.lastTriggered ? `, last ${formatRelativeTime(r.lastTriggered)}` : ''}
                </p>
              </div>
              <Switch checked={r.isActive} disabled={!canWrite} onCheckedChange={(v) => update.mutate({ id: r.id, isActive: v })} aria-label={r.isActive ? 'Disable rule' : 'Enable rule'} />
              {canWrite ? (
                <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)} aria-label="Delete rule"><Trash2 /></Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function AlertsView() {
  const canWrite = useCan(['ADMIN', 'MEMBER'])
  const [tab, setTab] = useState('activity')
  return (
    <>
      <PageHeader eyebrow="Security" title="Alerts">{canWrite && tab === 'rules' ? <NewRuleDialog /> : null}</PageHeader>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-4 inline-flex rounded border border-border bg-surface p-0.5" aria-label="Alerts sections">
          {[
            ['activity', 'Activity log'],
            ['rules', 'My rules'],
          ].map(([v, label]) => (
            <Tabs.Trigger key={v} value={v} className="rounded-sm px-4 py-1.5 font-display text-sm font-medium text-muted transition-colors data-[state=active]:bg-accent/15 data-[state=active]:text-accent">
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="activity"><ActivityLog /></Tabs.Content>
        <Tabs.Content value="rules"><Rules /></Tabs.Content>
      </Tabs.Root>
    </>
  )
}
