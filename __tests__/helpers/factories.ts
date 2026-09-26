import { randomUUID } from 'node:crypto'
import type { Device, DeviceDTO } from '@/lib/types'

/** Fixed dates, not new Date(): a test that depends on the clock fails at a boundary. */
export const buildDevice = (o: Partial<Device> = {}): Device => ({
  id: randomUUID(),
  macAddress: 'A4:83:E7:2C:11:09',
  ipAddress: '192.168.1.42',
  hostname: 'test-device',
  deviceName: null,
  deviceType: 'unknown',
  manufacturer: 'Apple, Inc.',
  signalStrength: null,
  status: 'online',
  isBlocked: false,
  isIgnored: false,
  totalConnectionTimeSeconds: 0,
  categoryId: null,
  firstSeen: new Date('2026-01-01T00:00:00Z'),
  lastSeen: new Date('2026-01-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...o,
})

export const buildDeviceDTO = (o: Partial<DeviceDTO> = {}): DeviceDTO => ({
  id: randomUUID(),
  macAddress: 'A4:83:E7:2C:11:09',
  ipAddress: '192.168.1.42',
  hostname: null,
  deviceName: null,
  displayName: 'A4:83:E7:2C:11:09',
  deviceType: 'unknown',
  manufacturer: null,
  status: 'online',
  signalStrength: null,
  firstSeen: '2026-01-01T00:00:00.000Z',
  lastSeen: '2026-01-01T00:00:00.000Z',
  totalConnectionTimeSeconds: 0,
  isBlocked: false,
  isIgnored: false,
  isUnknown: true,
  categoryId: null,
  currentBandwidth: null,
  totalTransferred: { uploadBytes: '0', downloadBytes: '0', uploadMegabytes: 0, downloadMegabytes: 0 },
  ...o,
})
