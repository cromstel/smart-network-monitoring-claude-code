'use client'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Radar, Search, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states'
import { StatusLabel } from '@/components/ui/status-dot'
import { useDevices, useScan } from '@/lib/hooks/queries'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { DEVICE_TYPES, type DeviceDTO } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { formatBytes, formatMbps, formatRelativeTime } from '@/lib/utils/format'
import { DEVICE_TYPE_LABELS, DeviceIcon } from './DeviceIcon'

const PAGE_SIZE = 50

function Bandwidth({ d }: { d: DeviceDTO }) {
  if (!d.currentBandwidth) return <span className="text-xs text-muted">—</span>
  return (
    <span className="num flex flex-col whitespace-nowrap text-xs leading-tight">
      <span className="text-down"><ArrowDown className="mr-0.5 inline size-3" />{formatMbps(d.currentBandwidth.downloadMbps)}</span>
      <span className="text-up"><ArrowUp className="mr-0.5 inline size-3" />{formatMbps(d.currentBandwidth.uploadMbps)}</span>
    </span>
  )
}

function NameCell({ d }: { d: DeviceDTO }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <DeviceIcon type={d.deviceType} unknown={d.isUnknown} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{d.displayName}</span>
          {d.isUnknown ? <Badge tone="warning">unknown</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted">{d.manufacturer ?? 'Unknown vendor'}{d.hostname && d.deviceName ? ` · ${d.hostname}` : ''}</p>
      </div>
    </div>
  )
}

export function DeviceList() {
  const params = useSearchParams()
  const router = useRouter()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [type, setType] = useState(params.get('type') ?? '')
  const [sort, setSort] = useState(params.get('sort') ?? 'lastSeen')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search, 300)
  const canScan = useCan(['ADMIN', 'MEMBER'])
  const scan = useScan()
  const toast = useToast()

  const filters = {
    search: debounced || undefined,
    status: status || undefined,
    type: type || undefined,
    sort,
    order: sort === 'name' ? 'asc' : 'desc',
    page,
    pageSize: PAGE_SIZE,
  }

  // Reset pagination when filters change: adjust state during render (React's
  // "storing information from previous renders" pattern) instead of an effect.
  const filterKey = `${debounced}|${status}|${type}|${sort}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const q = useDevices(filters)
  const total = q.data?.pagination.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = Boolean(debounced || status || type)

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Devices">
        {canScan ? (
          <Button
            variant="primary"
            disabled={scan.isPending}
            onClick={() =>
              scan.mutate(undefined, {
                onSuccess: (r) => toast({ tone: 'success', title: `Found ${r.devicesFound} devices`, body: `${r.newDevices} new since last scan` }),
                onError: (e) => toast({ tone: 'error', title: 'Scan failed', body: e instanceof Error ? e.message : undefined }),
              })
            }
          >
            <Radar className={cn(scan.isPending && 'animate-spin')} /> {scan.isPending ? 'Scanning…' : 'Scan now'}
          </Button>
        ) : null}
      </PageHeader>

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_200px_180px]">
          <label className="relative">
            <span className="sr-only">Search devices</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, hostname, IP, MAC, vendor…" className="pl-9" />
          </label>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="offline">Offline</option>
          </Select>
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>{DEVICE_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="lastSeen">Sort: last seen</option>
            <option value="name">Sort: name</option>
            <option value="bandwidth">Sort: bandwidth now</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {q.isPending ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.data.length === 0 ? (
          filtered ? (
            <EmptyState icon={<SearchX />} title="No devices match" action={<Button size="sm" onClick={() => { setSearch(''); setStatus(''); setType('') }}>Clear filters</Button>}>
              Try a shorter search or a different status.
            </EmptyState>
          ) : (
            <EmptyState icon={<Radar />} title="No devices discovered yet">The first scan runs when the server starts and then every scan interval. {canScan ? 'You can also scan now.' : ''}</EmptyState>
          )
        ) : (
          <>
            {/* Table ≥ md — overflow-x-auto so wide viewports scroll instead of clipping */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/40 text-left">
                    {['Device', 'IP address', 'MAC', 'Status', 'Now', 'Transferred', 'Last seen'].map((h) => (
                      <th key={h} scope="col" className="label-caps whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-border/60', q.isPlaceholderData && 'opacity-60')}>
                  {q.data.data.map((d) => (
                    <tr key={d.id} onClick={() => router.push(`/devices/${d.id}`)} className="cursor-pointer transition-colors hover:bg-accent/[0.04]">
                      <td className="max-w-[320px] px-3 py-2.5">
                        <Link href={`/devices/${d.id}`} onClick={(e) => e.stopPropagation()} className="block focus:outline-none">
                          <NameCell d={d} />
                        </Link>
                      </td>
                      <td className="num px-3 py-2.5 text-xs">{d.ipAddress}</td>
                      <td className="num px-3 py-2.5 text-xs text-muted">{d.macAddress}</td>
                      <td className="px-3 py-2.5"><StatusLabel status={d.status} /></td>
                      <td className="px-3 py-2.5"><Bandwidth d={d} /></td>
                      <td className="num px-3 py-2.5 text-xs text-muted">{formatBytes(BigInt(d.totalTransferred.downloadBytes) + BigInt(d.totalTransferred.uploadBytes))}</td>
                      <td className="num px-3 py-2.5 text-xs text-muted">{d.status === 'offline' ? formatRelativeTime(d.lastSeen) : 'now'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards < md */}
            <ul className="divide-y divide-border/60 md:hidden">
              {q.data.data.map((d) => (
                <li key={d.id}>
                  <Link href={`/devices/${d.id}`} className="flex items-center justify-between gap-3 px-3 py-3">
                    <NameCell d={d} />
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusLabel status={d.status} />
                      <span className="num text-[11px] text-muted">{d.ipAddress}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <p className="num text-xs text-muted">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
                <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
