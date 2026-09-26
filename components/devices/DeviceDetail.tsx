'use client'
import { ArrowDown, ArrowLeft, ArrowUp, Ban, LogIn, LogOut, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { ChartLegend, ThroughputChart } from '@/components/charts/ThroughputChart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/states'
import { StatusLabel } from '@/components/ui/status-dot'
import { ApiError, apiFetch } from '@/lib/hooks/api'
import { useDeleteDevice, useDevice, useDeviceBandwidth } from '@/lib/hooks/queries'
import { formatBytes, formatDuration, formatMbps, formatRelativeTime, formatSignal } from '@/lib/utils/format'
import { DEVICE_TYPE_LABELS, DeviceIcon } from './DeviceIcon'
import { EditDeviceDialog } from './EditDeviceDialog'

const RANGES = ['1h', '24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className={mono ? 'num mt-1 truncate text-sm' : 'mt-1 truncate text-sm'}>{children}</dd>
    </div>
  )
}

export function DeviceDetailView({ id }: { id: string }) {
  const [range, setRange] = useState<Range>('24h')
  const device = useDevice(id)
  const series = useDeviceBandwidth(id, range)
  const isAdmin = useCan(['ADMIN'])
  const canEdit = useCan(['ADMIN', 'MEMBER'])
  const del = useDeleteDevice()
  const router = useRouter()
  const toast = useToast()

  if (device.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    )
  }
  if (device.isError) {
    const missing = device.error instanceof ApiError && device.error.status === 404
    return (
      <Card>
        {missing ? (
          <EmptyState title="Device not found" action={<Button asChild size="sm"><Link href="/devices">Back to devices</Link></Button>}>It may have been deleted.</EmptyState>
        ) : (
          <ErrorState error={device.error} onRetry={() => void device.refetch()} />
        )}
      </Card>
    )
  }
  const d = device.data
  const totalBytes = BigInt(d.totalTransferred.downloadBytes) + BigInt(d.totalTransferred.uploadBytes)

  const block = async () => {
    try {
      await apiFetch(`/api/router/device/${d.id}/block`, { method: 'POST' })
    } catch (err) {
      toast({ tone: 'error', title: 'Cannot block', body: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <>
      <Link href="/devices" className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted hover:text-accent">
        <ArrowLeft className="size-3.5" /> Devices
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <DeviceIcon type={d.deviceType} unknown={d.isUnknown} className="size-14 [&_svg]:size-6" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold sm:text-3xl">{d.displayName}</h1>
              {d.isUnknown ? <Badge tone="warning">unknown</Badge> : null}
              {d.isIgnored ? <Badge>ignored</Badge> : null}
              {d.category ? <Badge tone="accent" style={{ color: d.category.color, borderColor: `${d.category.color}66` }}>{d.category.name}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <StatusLabel status={d.status} />
              <span className="num text-xs text-muted">{d.ipAddress}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? <EditDeviceDialog device={d} /> : null}
          {isAdmin ? (
            <Button variant="ghost" onClick={() => void block()} title="Requires router support">
              <Ban /> Block
            </Button>
          ) : null}
          {isAdmin ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger"><Trash2 /> Delete</Button>
              </DialogTrigger>
              <DialogContent title={`Delete ${d.displayName}?`} description="This removes its history, connection log and alerts. If the device is still on the network it will reappear on the next scan — to hide it permanently, mark it as ignored instead.">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="danger"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(d.id, {
                        onSuccess: () => {
                          toast({ tone: 'success', title: 'Device deleted' })
                          router.push('/devices')
                        },
                        onError: (e) => toast({ tone: 'error', title: 'Delete failed', body: e instanceof Error ? e.message : undefined }),
                      })
                    }
                  >
                    Delete permanently
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Download now', value: d.currentBandwidth ? formatMbps(d.currentBandwidth.downloadMbps) : '—', cls: 'text-down', icon: <ArrowDown className="size-4 text-down" /> },
              { label: 'Upload now', value: d.currentBandwidth ? formatMbps(d.currentBandwidth.uploadMbps) : '—', cls: 'text-up', icon: <ArrowUp className="size-4 text-up" /> },
              { label: 'Peak ↓ (30d)', value: formatMbps(d.stats.peakDownloadMbps), cls: '', icon: null },
              { label: 'Transferred', value: formatBytes(totalBytes), cls: '', icon: null },
            ].map((s) => (
              <Card key={s.label}>
                <CardBody className="py-3">
                  <div className="flex items-center justify-between"><p className="label-caps">{s.label}</p>{s.icon}</div>
                  <p className={`num mt-1.5 text-xl ${s.cls}`}>{s.value}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Bandwidth" subtitle={series.data ? (series.data.resolution === 'hourly' ? 'Hourly averages' : 'Per-scan samples') : undefined} action={<Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />} />
            <CardBody>
              <div className="mb-3"><ChartLegend /></div>
              {series.isPending ? (
                <Skeleton className="h-[280px]" />
              ) : series.isError ? (
                <ErrorState error={series.error} onRetry={() => void series.refetch()} />
              ) : series.data.points.length === 0 ? (
                <EmptyState title="No bandwidth samples in this range">Traffic is measured only by scanners that can see it. ARP discovery reports presence, not usage.</EmptyState>
              ) : (
                <ThroughputChart points={series.data.points} range={range} height={280} />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Identity" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="MAC address" mono>{d.macAddress}</Field>
                <Field label="IP address" mono>{d.ipAddress}</Field>
                <Field label="Hostname" mono>{d.hostname ?? '—'}</Field>
                <Field label="Type">{DEVICE_TYPE_LABELS[d.deviceType]}</Field>
                <div className="col-span-2"><Field label="Manufacturer">{d.manufacturer ?? 'Unknown vendor'}</Field></div>
                <Field label="First seen" mono>{new Date(d.firstSeen).toLocaleDateString()}</Field>
                <Field label="Last seen" mono>{d.status === 'offline' ? formatRelativeTime(d.lastSeen) : 'now'}</Field>
                <Field label="Connected for" mono>{formatDuration(d.totalConnectionTimeSeconds)}</Field>
                <Field label="Signal" mono>{formatSignal(d.signalStrength)}</Field>
                <Field label="Sessions" mono>{d.stats.sessionCount}</Field>
                <Field label="Avg session" mono>{formatDuration(d.stats.averageSessionSeconds)}</Field>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Connection timeline" subtitle="Most recent 20 events" />
            <CardBody>
              {d.connectionLogs.length === 0 ? (
                <p className="text-sm text-muted">No connection events recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {d.connectionLogs.map((l) => (
                    <li key={l.id} className="relative">
                      <span className={`absolute -left-[27px] top-0.5 grid size-4 place-items-center rounded-full border bg-surface ${l.eventType === 'connected' ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
                        {l.eventType === 'connected' ? <LogIn className="size-2.5" /> : <LogOut className="size-2.5" />}
                      </span>
                      <p className="text-sm">{l.eventType === 'connected' ? 'Connected' : 'Disconnected'}{l.connectionDurationSeconds !== null ? <span className="text-muted"> after {formatDuration(l.connectionDurationSeconds)}</span> : null}</p>
                      <p className="num text-[11px] text-muted">{new Date(l.timestamp).toLocaleString()}{l.ipAddress ? ` · ${l.ipAddress}` : ''}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

export function DeviceDetailSkeleton() {
  return <SkeletonRows rows={6} />
}
