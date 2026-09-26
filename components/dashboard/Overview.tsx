'use client'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Radar, ShieldAlert, Wifi } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { ChartLegend, ThroughputChart } from '@/components/charts/ThroughputChart'
import { DeviceIcon } from '@/components/devices/DeviceIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/states'
import { useCurrentBandwidth, useHealth, useNetworkHistory, useNotifications, useRouterStatus, useScan, useTopConsumers } from '@/lib/hooks/queries'
import { formatBytes, formatMbps, formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

const RANGES = ['1h', '24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

const reveal = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.35, ease: [0.2, 0.7, 0.3, 1] as const } })

function StatTile({ label, value, sub, tone, icon, loading, i, href }: { label: string; value: string; sub?: React.ReactNode; tone?: 'down' | 'up' | 'warning' | 'accent'; icon: React.ReactNode; loading: boolean; i: number; href?: string }) {
  const body = (
    <Card className={cn('h-full overflow-hidden transition-colors', href && 'hover:border-accent/50')}>
      <CardBody>
        <div className="flex items-center justify-between">
          <p className="label-caps">{label}</p>
          <span className={cn('[&_svg]:size-4', tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : tone === 'warning' ? 'text-warning' : 'text-accent')}>{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-9 w-2/3" />
        ) : (
          <p className={cn('num mt-2 whitespace-nowrap text-2xl font-medium tracking-tight sm:text-3xl xl:text-[34px]', tone === 'down' && 'text-down', tone === 'up' && 'text-up', tone === 'warning' && 'text-warning')}>{value}</p>
        )}
        <div className="mt-1 min-h-[18px] text-xs text-muted">{loading ? null : sub}</div>
      </CardBody>
      <div className={cn('absolute inset-x-0 bottom-0 h-px', tone === 'down' ? 'bg-down/40' : tone === 'up' ? 'bg-up/40' : tone === 'warning' ? 'bg-warning/40' : 'bg-accent/40')} />
    </Card>
  )
  return <motion.div {...reveal(i)} className="h-full">{href ? <Link href={href} className="block h-full">{body}</Link> : body}</motion.div>
}

function TopConsumers() {
  const top = useTopConsumers('24h', 6)
  const max = Math.max(1, ...(top.data ?? []).map((t) => t.totalMegabytes))
  return (
    <Card>
      <CardHeader title="Top consumers" subtitle="Bytes transferred, last 24 hours" />
      <CardBody className="space-y-3">
        {top.isPending ? (
          <SkeletonRows rows={5} />
        ) : top.isError ? (
          <ErrorState compact error={top.error} onRetry={() => void top.refetch()} />
        ) : top.data.length === 0 ? (
          <EmptyState title="No traffic measured yet">Per-device bandwidth needs a scanner that can see traffic (simulated or router with traffic stats). ARP-only mode detects presence but not usage.</EmptyState>
        ) : (
          top.data.map((t, idx) => (
            <Link key={t.deviceId} href={`/devices/${t.deviceId}`} className="group block">
              <div className="flex items-center gap-3">
                <span className="num w-4 text-xs text-muted">{idx + 1}</span>
                <DeviceIcon type={t.deviceType} className="size-7" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm group-hover:text-accent">{t.displayName}</span>
                    <span className="num shrink-0 text-xs text-muted">{formatBytes(t.totalBytes)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-down to-accent" style={{ width: `${Math.max(3, (t.totalMegabytes / max) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </CardBody>
    </Card>
  )
}

function RecentAlerts() {
  const n = useNotifications({ pageSize: 5 })
  return (
    <Card>
      <CardHeader
        title="Recent alerts"
        action={
          <Link href="/alerts" className="font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">
            View all
          </Link>
        }
      />
      <CardBody className="p-0">
        {n.isPending ? (
          <div className="p-4"><SkeletonRows rows={3} /></div>
        ) : n.isError ? (
          <ErrorState compact error={n.error} onRetry={() => void n.refetch()} />
        ) : n.data.data.length === 0 ? (
          <EmptyState icon={<ShieldAlert />} title="All quiet">Alerts appear here when an unknown device joins, a device goes offline, or bandwidth crosses a threshold.</EmptyState>
        ) : (
          <ul className="divide-y divide-border/70">
            {n.data.data.map((a) => (
              <li key={a.id} className="flex gap-3 px-4 py-3">
                <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', a.isRead ? 'bg-muted/40' : a.priority === 'high' ? 'bg-warning shadow-[0_0_6px_rgb(var(--warning))]' : 'bg-down')} />
                <div className="min-w-0">
                  <p className={cn('truncate text-sm', !a.isRead && 'font-medium')}>{a.title}</p>
                  <p className="num text-[11px] text-muted">{formatRelativeTime(a.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function SystemStatus() {
  const health = useHealth()
  const router = useRouterStatus()
  return (
    <Card>
      <CardHeader title="System" />
      <CardBody className="space-y-2.5 text-sm">
        <Row label="Scanner" value={health.data?.scanner.mode ?? '—'} ok={health.data?.scanner.healthy} />
        <Row label="Last scan" value={health.data?.scanner.lastScanAt ? formatRelativeTime(health.data.scanner.lastScanAt) : 'pending'} />
        <Row label="Database" value={health.data?.database.client ?? '—'} ok={health.data?.database.connected} />
        <Row
          label="Router"
          value={router.data ? (router.data.configured ? (router.data.reachable ? router.data.modelNumber ?? 'reachable' : 'unreachable') : 'not configured') : '—'}
          ok={router.data?.configured ? router.data.reachable : undefined}
        />
      </CardBody>
    </Card>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-caps">{label}</span>
      <span className="flex items-center gap-2 font-mono text-xs">
        {ok !== undefined ? <span className={cn('size-1.5 rounded-full', ok ? 'bg-success' : 'bg-danger')} /> : null}
        {value}
      </span>
    </div>
  )
}

export function Overview() {
  const [range, setRange] = useState<Range>('24h')
  const current = useCurrentBandwidth()
  const history = useNetworkHistory(range)
  const scan = useScan()
  const toast = useToast()
  const canScan = useCan(['ADMIN', 'MEMBER'])
  const c = current.data

  const runScan = () =>
    scan.mutate(undefined, {
      onSuccess: (r) => toast({ tone: 'success', title: `Scan complete — ${r.devicesFound} devices`, body: `${r.newDevices} new · ${r.wentOffline} went offline · ${r.durationMs} ms via ${r.scanner}` }),
      onError: (e) => toast({ tone: 'error', title: 'Scan failed', body: e instanceof Error ? e.message : undefined }),
    })

  return (
    <>
      <PageHeader eyebrow="Network overview" title="What’s on your network">
        {canScan ? (
          <Button variant="primary" onClick={runScan} disabled={scan.isPending}>
            <Radar className={cn(scan.isPending && 'animate-spin')} /> {scan.isPending ? 'Scanning…' : 'Scan now'}
          </Button>
        ) : null}
      </PageHeader>

      {current.isError ? (
        <Card className="mb-4"><ErrorState error={current.error} onRetry={() => void current.refetch()} /></Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile i={0} loading={current.isPending} label="Online" icon={<Wifi />} tone="accent" value={c ? `${c.onlineDevices}` : '—'} sub={c ? <>of {c.totalDevices} known devices</> : null} href="/devices?status=online" />
        <StatTile i={1} loading={current.isPending} label="Download" icon={<ArrowDown />} tone="down" value={c ? formatMbps(c.downloadMbps) : '—'} sub={c ? <>peak today {formatMbps(c.peakTodayDownloadMbps)}</> : null} />
        <StatTile i={2} loading={current.isPending} label="Upload" icon={<ArrowUp />} tone="up" value={c ? formatMbps(c.uploadMbps) : '—'} sub={c ? <>peak today {formatMbps(c.peakTodayUploadMbps)}</> : null} />
        <StatTile
          i={3}
          loading={current.isPending}
          label="Unknown"
          icon={<ShieldAlert />}
          tone={c && c.unknownDevices > 0 ? 'warning' : 'accent'}
          value={c ? `${c.unknownDevices}` : '—'}
          sub={c ? (c.unknownDevices > 0 ? 'unnamed devices — should they be here?' : 'every device is accounted for') : null}
          href="/devices?sort=name"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div {...reveal(4)} className="space-y-4">
          <Card>
            <CardHeader title="Network throughput" subtitle={history.data ? `${history.data.resolution === 'hourly' ? 'Hourly averages' : 'Live samples'} · all devices` : undefined} action={<Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />} />
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <ChartLegend />
                {c?.sampledAt ? <Badge tone="accent">updated {formatRelativeTime(c.sampledAt)}</Badge> : null}
              </div>
              {history.isPending ? (
                <Skeleton className="h-[260px]" />
              ) : history.isError ? (
                <ErrorState error={history.error} onRetry={() => void history.refetch()} />
              ) : history.data.points.length === 0 ? (
                <EmptyState title="No history for this range yet">Samples accumulate with every scan. {range === '7d' || range === '30d' ? 'Longer ranges read hourly rollups, written at five past each hour.' : ''}</EmptyState>
              ) : (
                <ThroughputChart points={history.data.points} range={range} />
              )}
            </CardBody>
          </Card>
          <RecentAlerts />
        </motion.div>
        <motion.div {...reveal(5)} className="space-y-4">
          <TopConsumers />
          <SystemStatus />
        </motion.div>
      </div>
    </>
  )
}
