'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/AppShell'
import { useCan } from '@/components/layout/SessionContext'
import { useToast } from '@/components/layout/Toasts'
import { useTheme } from '@/components/layout/useTheme'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { ErrorState, SkeletonRows } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { apiFetch, fieldErrors } from '@/lib/hooks/api'
import { useSettings, useUpdateSettings } from '@/lib/hooks/queries'
import type { SettingsDTO, Theme } from '@/lib/types'
import { isValidCidr } from '@/lib/utils/network'

const networkSchema = z.object({
  networkSubnet: z.string().trim().refine(isValidCidr, 'Enter an IPv4 CIDR such as 192.168.1.0/24.'),
  scanIntervalSeconds: z.coerce.number().int().min(30, 'At least 30 seconds.').max(3600, 'At most 1 hour.'),
  dataRetentionDays: z.coerce.number().int().min(1, 'At least 1 day.').max(365, 'At most 365 days.'),
  ignoreSubnets: z
    .string()
    .trim()
    .refine((s) => s === '' || s.split(/[\s,]+/).every(isValidCidr), 'Separate CIDRs with commas, e.g. 10.0.5.0/24.'),
})

function NetworkCard({ settings }: { settings: SettingsDTO }) {
  const isAdmin = useCan(['ADMIN'])
  const update = useUpdateSettings()
  const toast = useToast()
  const form = useForm<z.input<typeof networkSchema>, unknown, z.output<typeof networkSchema>>({
    resolver: zodResolver(networkSchema),
    values: {
      networkSubnet: settings.networkSubnet,
      scanIntervalSeconds: settings.scanIntervalSeconds,
      dataRetentionDays: settings.dataRetentionDays,
      ignoreSubnets: settings.ignoreSubnets.join(', '),
    },
  })
  const e = form.formState.errors
  const submit = form.handleSubmit((v) =>
    update.mutate(
      { networkSubnet: v.networkSubnet, scanIntervalSeconds: v.scanIntervalSeconds, dataRetentionDays: v.dataRetentionDays, ignoreSubnets: v.ignoreSubnets ? v.ignoreSubnets.split(/[\s,]+/).filter(Boolean) : [] },
      {
        onSuccess: () => toast({ tone: 'success', title: 'Network settings saved', body: 'A new scan interval takes effect after the current cycle — no restart needed.' }),
        onError: (err) => {
          for (const [k, m] of Object.entries(fieldErrors(err))) form.setError(k as keyof z.input<typeof networkSchema>, { message: m })
          toast({ tone: 'error', title: 'Could not save', body: err instanceof Error ? err.message : undefined })
        },
      },
    ),
  )
  return (
    <Card>
      <CardHeader title="Network" subtitle={isAdmin ? 'Applies to the whole installation' : 'Read-only — an admin manages these'} />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <fieldset disabled={!isAdmin} className="contents">
            <div className="sm:col-span-2">
              <Label htmlFor="networkSubnet">Monitored subnet</Label>
              <Input id="networkSubnet" className="num" aria-invalid={!!e.networkSubnet} {...form.register('networkSubnet')} />
              <FieldError message={e.networkSubnet?.message} />
            </div>
            <div>
              <Label htmlFor="scanIntervalSeconds">Scan interval (seconds)</Label>
              <Input id="scanIntervalSeconds" type="number" className="num" aria-invalid={!!e.scanIntervalSeconds} {...form.register('scanIntervalSeconds')} />
              <FieldError message={e.scanIntervalSeconds?.message} />
              <FieldHint>30 s to 1 h. Devices go offline after two missed scans (minimum 2 min).</FieldHint>
            </div>
            <div>
              <Label htmlFor="dataRetentionDays">Keep history (days)</Label>
              <Input id="dataRetentionDays" type="number" className="num" aria-invalid={!!e.dataRetentionDays} {...form.register('dataRetentionDays')} />
              <FieldError message={e.dataRetentionDays?.message} />
              <FieldHint>Older samples, logs and alerts are pruned nightly.</FieldHint>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ignoreSubnets">Ignored subnets</Label>
              <Input id="ignoreSubnets" className="num" placeholder="e.g. 192.168.1.200/29" aria-invalid={!!e.ignoreSubnets} {...form.register('ignoreSubnets')} />
              <FieldError message={e.ignoreSubnets?.message} />
            </div>
            {isAdmin ? (
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="primary" disabled={update.isPending || !form.formState.isDirty}><Save /> Save network</Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </CardBody>
    </Card>
  )
}

function NotificationsCard({ settings }: { settings: SettingsDTO }) {
  const canWrite = useCan(['ADMIN', 'MEMBER'])
  const update = useUpdateSettings()
  const toast = useToast()
  const set = (patch: Partial<SettingsDTO>) => update.mutate(patch, { onError: (e) => toast({ tone: 'error', title: 'Could not save', body: e instanceof Error ? e.message : undefined }) })
  const rows: { key: 'notifyNewDevices' | 'notifyDeviceOffline' | 'notifyHighBandwidth'; title: string; blurb: string }[] = [
    { key: 'notifyNewDevices', title: 'Unknown devices', blurb: 'When a device the network has never seen connects.' },
    { key: 'notifyDeviceOffline', title: 'Named devices going offline', blurb: 'When a device you have named stops responding.' },
    { key: 'notifyHighBandwidth', title: 'High bandwidth', blurb: 'When any device exceeds your threshold below.' },
  ]
  return (
    <Card>
      <CardHeader title="Notifications" subtitle="Only you receive these" />
      <CardBody className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 rounded px-1 py-2.5">
            <div>
              <p className="text-sm">{r.title}</p>
              <p className="text-xs text-muted">{r.blurb}</p>
            </div>
            <Switch checked={settings[r.key]} disabled={!canWrite || update.isPending} onCheckedChange={(v) => set({ [r.key]: v })} aria-label={r.title} />
          </div>
        ))}
        <div className="flex items-end gap-3 px-1 pt-2">
          <div className="flex-1">
            <Label htmlFor="bandwidthThreshold">Bandwidth threshold (Mbps)</Label>
            <Input
              id="bandwidthThreshold"
              key={settings.bandwidthThreshold}
              type="number"
              min={1}
              className="num"
              defaultValue={settings.bandwidthThreshold}
              disabled={!canWrite}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v > 0 && v !== settings.bandwidthThreshold) set({ bandwidthThreshold: v })
              }}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

const passwordSchema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: z.string().min(10, 'Use at least 10 characters.'), confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })

function AccountCard() {
  const toast = useToast()
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } })
  const e = form.formState.errors
  const submit = form.handleSubmit(async (v) => {
    try {
      await apiFetch('/api/auth/password', { method: 'POST', json: { currentPassword: v.currentPassword, newPassword: v.newPassword } })
      form.reset()
      toast({ tone: 'success', title: 'Password changed' })
    } catch (err) {
      form.setError('currentPassword', { message: err instanceof Error ? err.message : 'Could not change password' })
    }
  })
  return (
    <Card>
      <CardHeader title="Account" subtitle="Change your password" />
      <CardBody>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!e.currentPassword} {...form.register('currentPassword')} />
            <FieldError message={e.currentPassword?.message} />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!e.newPassword} {...form.register('newPassword')} />
            <FieldError message={e.newPassword?.message} />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!e.confirm} {...form.register('confirm')} />
            <FieldError message={e.confirm?.message} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>Change password</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader title="Appearance" />
      <CardBody className="flex items-center justify-between gap-4">
        <p className="text-sm">Theme</p>
        <Segmented<Theme> label="Theme" value={theme} options={['dark', 'light', 'system']} onChange={setTheme} />
      </CardBody>
    </Card>
  )
}

export function SettingsView() {
  const settings = useSettings()
  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" />
      {settings.isPending ? (
        <Card><CardBody><SkeletonRows rows={6} /></CardBody></Card>
      ) : settings.isError ? (
        <Card><ErrorState error={settings.error} onRetry={() => void settings.refetch()} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <NetworkCard settings={settings.data} />
            <AppearanceCard />
          </div>
          <div className="space-y-4">
            <NotificationsCard settings={settings.data} />
            <AccountCard />
          </div>
        </div>
      )}
    </>
  )
}
