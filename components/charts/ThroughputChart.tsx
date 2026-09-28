'use client'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BandwidthPointDTO } from '@/lib/types'
import { formatBytes, formatMbps } from '@/lib/utils/format'
import { useThemeColors } from './useThemeColors'

function tickTime(ts: number, range: string): string {
  const d = new Date(ts)
  if (range === '7d' || range === '30d') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface Row {
  t: number
  down: number
  up: number
  downBytes: string
  upBytes: string
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const row = payload?.[0]?.payload as Row | undefined
  if (!active || !row) return null
  return (
    <div className="panel bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-mono text-muted">{new Date(row.t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <p className="num text-down">↓ {formatMbps(row.down)} <span className="text-muted">· {formatBytes(row.downBytes)}</span></p>
      <p className="num text-up">↑ {formatMbps(row.up)} <span className="text-muted">· {formatBytes(row.upBytes)}</span></p>
    </div>
  )
}

export function ThroughputChart({ points, range, height = 260 }: { points: BandwidthPointDTO[]; range: string; height?: number }) {
  const c = useThemeColors()
  const data: Row[] = points.map((p) => ({ t: new Date(p.timestamp).getTime(), down: p.downloadMbps, up: p.uploadMbps, downBytes: p.downloadBytes, upBytes: p.uploadBytes }))
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Throughput over ${range}: download in cyan, upload in amber`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 36, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.down} stopOpacity={0.45} />
              <stop offset="100%" stopColor={c.down} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.up} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c.up} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => tickTime(v, range)}
            tick={{ fill: c.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: c.grid }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}G` : v >= 10 ? v.toFixed(0) : v.toFixed(1))}
            tick={{ fill: c.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={44}
            unit=""
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.accent, strokeOpacity: 0.4 }} />
          <Area type="monotone" dataKey="down" stroke={c.down} strokeWidth={1.6} fill="url(#gDown)" isAnimationActive={false} name="Download" />
          <Area type="monotone" dataKey="up" stroke={c.up} strokeWidth={1.4} fill="url(#gUp)" isAnimationActive={false} name="Upload" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartLegend() {
  return (
    <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-muted">
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-down" /> down</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-up" /> up</span>
      <span className="normal-case tracking-normal">Mbps</span>
    </div>
  )
}
