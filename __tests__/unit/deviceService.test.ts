/** Unit: mock the repositories, not the database — the service is the only real thing here. */
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import * as connectionRepo from '@/lib/db/repositories/connectionLogRepository'
import { markStaleDevicesOffline, offlineCutoff } from '@/lib/services/deviceService'
import { buildDevice } from '../helpers/factories'

jest.mock('@/lib/db/repositories/deviceRepository')
jest.mock('@/lib/db/repositories/connectionLogRepository')

const NOW = new Date('2026-09-24T12:00:00Z')

it('marks a device offline after two missed scans and records the session length', async () => {
  const stale = buildDevice({ id: 'd1', lastSeen: new Date(NOW.getTime() - 150_000), status: 'online' })
  jest.mocked(deviceRepo.findOnlineLastSeenBefore).mockResolvedValue([stale])
  jest.mocked(connectionRepo.latestConnectedAt).mockResolvedValue(new Map([['d1', new Date(stale.lastSeen.getTime() - 3600_000)]]))

  const result = await markStaleDevicesOffline(30, NOW)

  expect(deviceRepo.updateStatus).toHaveBeenCalledWith('d1', 'offline')
  expect(connectionRepo.logDisconnection).toHaveBeenCalledWith('d1', stale.ipAddress, stale.lastSeen, 3600)
  expect(deviceRepo.addConnectionTime).toHaveBeenCalledWith('d1', 3600)
  expect(result).toHaveLength(1)
})

it('does nothing when no device is stale', async () => {
  jest.mocked(deviceRepo.findOnlineLastSeenBefore).mockResolvedValue([])
  expect(await markStaleDevicesOffline(30, NOW)).toEqual([])
  expect(deviceRepo.updateStatus).not.toHaveBeenCalled()
})

it('never marks offline sooner than two minutes, however short the interval (PRD F-06)', () => {
  expect(NOW.getTime() - offlineCutoff(30, NOW).getTime()).toBe(120_000)
  expect(NOW.getTime() - offlineCutoff(300, NOW).getTime()).toBe(600_000)
})
