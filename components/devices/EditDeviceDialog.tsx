'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useToast } from '@/components/layout/Toasts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { fieldErrors } from '@/lib/hooks/api'
import { useCategories, useUpdateDevice } from '@/lib/hooks/queries'
import { DEVICE_TYPES, type DeviceDTO } from '@/lib/types'
import { DEVICE_TYPE_LABELS } from './DeviceIcon'

const schema = z.object({
  deviceName: z.string().trim().max(255, 'Keep it under 255 characters.'),
  deviceType: z.enum(DEVICE_TYPES),
  categoryId: z.string(),
  isIgnored: z.boolean(),
})
type Values = z.infer<typeof schema>

export function EditDeviceDialog({ device }: { device: DeviceDTO }) {
  const [open, setOpen] = useState(false)
  const categories = useCategories()
  const update = useUpdateDevice(device.id)
  const toast = useToast()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { deviceName: device.deviceName ?? '', deviceType: device.deviceType, categoryId: device.categoryId ?? '', isIgnored: device.isIgnored },
  })

  const submit = form.handleSubmit((v) =>
    update.mutate(
      { deviceName: v.deviceName || null, deviceType: v.deviceType, categoryId: v.categoryId || null, isIgnored: v.isIgnored },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: 'Device updated' })
          setOpen(false)
        },
        onError: (err) => {
          for (const [k, m] of Object.entries(fieldErrors(err))) form.setError(k as keyof Values, { message: m })
          toast({ tone: 'error', title: 'Could not save', body: err instanceof Error ? err.message : undefined })
        },
      },
    ),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Pencil /> Edit</Button>
      </DialogTrigger>
      <DialogContent title="Edit device" description="Naming a device marks it as known — unknown devices raise alerts.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="deviceName">Name</Label>
            <Input id="deviceName" placeholder={device.hostname ?? device.macAddress} aria-invalid={!!form.formState.errors.deviceName} {...form.register('deviceName')} />
            <FieldError message={form.formState.errors.deviceName?.message} />
            <FieldHint>Leave empty to fall back to the hostname, then the MAC address.</FieldHint>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="deviceType">Type</Label>
              <Select id="deviceType" {...form.register('deviceType')}>
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{DEVICE_TYPE_LABELS[t]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="categoryId">Category</Label>
              <Select id="categoryId" {...form.register('categoryId')}>
                <option value="">None</option>
                {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <FieldError message={form.formState.errors.categoryId?.message} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded border border-border px-3 py-2.5">
            <div>
              <p className="text-sm">Hide this device</p>
              <p className="text-xs text-muted">Ignored devices are hidden from lists and never alert.</p>
            </div>
            <Switch checked={form.watch('isIgnored')} onCheckedChange={(v) => form.setValue('isIgnored', v, { shouldDirty: true })} aria-label="Ignore device" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
