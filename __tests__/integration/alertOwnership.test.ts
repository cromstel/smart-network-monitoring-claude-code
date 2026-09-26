/**
 * PRD F-34 / TODO B-51. Written before the feature, kept forever.
 * A related project shipped a bug where one user's bandwidth threshold notified every user.
 */
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db/schema'
import * as alertRepo from '@/lib/db/repositories/alertRepository'
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import { createRule, deleteRule, evaluateAlerts, listRules, onDeviceOffline, onNewDevice, updateRule } from '@/lib/services/alertService'
import { subscribe, type BusEvent } from '@/lib/services/eventBus'
import { DIALECTS, createTestDb, createUser, destroyTestDb, insertDevice, truncateAll } from '../helpers/db'

const notificationsFor = async (userId: string) => (await notificationRepo.listForUser(userId, { limit: 100, offset: 0 })).notifications

describe.each(DIALECTS)('alert ownership [%s]', (client) => {
  let db: Kysely<DB>
  beforeAll(async () => {
    db = await createTestDb(client)
  })
  afterEach(async () => {
    await truncateAll(db)
  })
  afterAll(async () => {
    await destroyTestDb()
  })

  it("never delivers one user's alert to another user", async () => {
    const [ana, sam] = await Promise.all([createUser('ana'), createUser('sam')])
    const deviceId = await insertDevice(db)
    await alertRepo.create({ userId: ana.id, deviceId: null, alertType: 'bandwidth_exceeded', threshold: 10, isActive: true })

    await evaluateAlerts({ deviceId, downloadMbps: 50 })

    expect(await notificationsFor(ana.id)).toHaveLength(1)
    expect(await notificationsFor(sam.id)).toHaveLength(0)
  })

  it('publishes alert.raised scoped to the owner only', async () => {
    const [ana] = await Promise.all([createUser('ana'), createUser('sam')])
    const deviceId = await insertDevice(db)
    await alertRepo.create({ userId: ana.id, deviceId, alertType: 'bandwidth_exceeded', threshold: 10, isActive: true })
    const events: BusEvent[] = []
    const off = subscribe((e) => events.push(e))
    await evaluateAlerts({ deviceId, downloadMbps: 50 })
    off()
    const raised = events.filter((e) => e.name === 'alert.raised')
    expect(raised).toHaveLength(1)
    expect(raised[0]?.userId).toBe(ana.id)
  })

  it("uses each user's own threshold; one user matched by rule and toggle gets one notification", async () => {
    const ana = await createUser('ana', 'MEMBER', { notifyHighBandwidth: true, bandwidthThreshold: 20 })
    const sam = await createUser('sam', 'MEMBER', { notifyHighBandwidth: true, bandwidthThreshold: 80 })
    const deviceId = await insertDevice(db)
    await alertRepo.create({ userId: ana.id, deviceId, alertType: 'bandwidth_exceeded', threshold: 30, isActive: true })

    await evaluateAlerts({ deviceId, downloadMbps: 50 })

    expect(await notificationsFor(ana.id)).toHaveLength(1)
    expect(await notificationsFor(sam.id)).toHaveLength(0) // 50 < sam's 80
  })

  it('respects the cooldown: a sustained spike does not re-alert every scan', async () => {
    const ana = await createUser('ana')
    const deviceId = await insertDevice(db)
    await alertRepo.create({ userId: ana.id, deviceId: null, alertType: 'bandwidth_exceeded', threshold: 10, isActive: true })
    await evaluateAlerts({ deviceId, downloadMbps: 50 })
    await evaluateAlerts({ deviceId, downloadMbps: 60 })
    expect(await notificationsFor(ana.id)).toHaveLength(1)
    const rule = (await alertRepo.listForUser(ana.id))[0]
    expect(rule?.triggerCount).toBe(1)
  })

  it('an inactive rule, or a deactivated owner, raises nothing', async () => {
    const ana = await createUser('ana')
    const deviceId = await insertDevice(db)
    const rule = await alertRepo.create({ userId: ana.id, deviceId: null, alertType: 'bandwidth_exceeded', threshold: 10, isActive: false })
    await evaluateAlerts({ deviceId, downloadMbps: 50 })
    await alertRepo.update(rule.id, { isActive: true })
    await db.updateTable('users').set({ is_active: 0 }).where('id', '=', ana.id).execute()
    await evaluateAlerts({ deviceId, downloadMbps: 50 })
    expect(await notificationsFor(ana.id)).toHaveLength(0)
  })

  it('unknown device: exactly one alert per interested user, none for the uninterested', async () => {
    const ana = await createUser('ana', 'ADMIN', { notifyNewDevices: true })
    const sam = await createUser('sam', 'MEMBER', { notifyNewDevices: false })
    const viewer = await createUser('vic', 'VIEWER', { notifyNewDevices: false })
    await alertRepo.create({ userId: viewer.id, deviceId: null, alertType: 'unknown_device', threshold: null, isActive: true })
    await alertRepo.create({ userId: ana.id, deviceId: null, alertType: 'unknown_device', threshold: null, isActive: true }) // also has the toggle
    const deviceId = await insertDevice(db)
    const device = await deviceRepo.findById(deviceId)
    if (!device) throw new Error('missing')

    await onNewDevice(device)
    await onNewDevice(device) // a racing duplicate scan

    expect(await notificationsFor(ana.id)).toHaveLength(1)
    expect(await notificationsFor(viewer.id)).toHaveLength(1)
    expect(await notificationsFor(sam.id)).toHaveLength(0)
  })

  it('offline alerts: built-ins cover named devices only; a device-specific rule covers any device', async () => {
    const ana = await createUser('ana', 'MEMBER', { notifyDeviceOffline: true })
    const sam = await createUser('sam')
    const unnamedId = await insertDevice(db, { mac: 'AA:00:00:00:00:01' })
    const namedId = await insertDevice(db, { mac: 'AA:00:00:00:00:02', name: 'Laptop' })
    await alertRepo.create({ userId: sam.id, deviceId: unnamedId, alertType: 'device_offline', threshold: null, isActive: true })
    const unnamed = await deviceRepo.findById(unnamedId)
    const named = await deviceRepo.findById(namedId)
    if (!unnamed || !named) throw new Error('missing')

    await onDeviceOffline(unnamed)
    await onDeviceOffline(named)

    expect((await notificationsFor(ana.id)).map((n) => n.deviceId)).toEqual([namedId])
    expect((await notificationsFor(sam.id)).map((n) => n.deviceId)).toEqual([unnamedId])
  })

  it('rule management is owner-scoped: non-owners get NOT_FOUND, owner comes from the session', async () => {
    const ana = await createUser('ana')
    const sam = await createUser('sam')
    const admin = await createUser('root', 'ADMIN')
    const rule = await createRule({ id: ana.id, role: 'MEMBER' }, { alertType: 'unknown_device', deviceId: null, threshold: 99, isActive: true })
    expect(rule.userId).toBe(ana.id)
    expect(rule.threshold).toBeNull() // ignored for non-bandwidth rules

    expect(await listRules({ id: sam.id, role: 'MEMBER' }, 'mine')).toHaveLength(0)
    await expect(updateRule({ id: sam.id, role: 'MEMBER' }, rule.id, { isActive: false })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(deleteRule({ id: sam.id, role: 'MEMBER' }, rule.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(listRules({ id: sam.id, role: 'MEMBER' }, 'all')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(createRule({ id: sam.id, role: 'VIEWER' }, { alertType: 'unknown_device', deviceId: null, threshold: null, isActive: true })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(await listRules({ id: admin.id, role: 'ADMIN' }, 'mine')).toHaveLength(0) // not even an admin sees others by default
    expect(await listRules({ id: admin.id, role: 'ADMIN' }, 'all')).toHaveLength(1)
    await deleteRule({ id: ana.id, role: 'MEMBER' }, rule.id)
    expect(await listRules({ id: ana.id, role: 'MEMBER' }, 'mine')).toHaveLength(0)
  })
})
