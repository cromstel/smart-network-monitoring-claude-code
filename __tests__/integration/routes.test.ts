/**
 * Route handlers called directly against a real database: authentication, per-route
 * authorisation (PRD F-62, TODO B-34), envelopes, and the "no secret leaves" guarantees.
 */
import type { Kysely } from 'kysely'
import type { NextRequest } from 'next/server'
import type { DB } from '@/lib/db/schema'
import * as bandwidthRepo from '@/lib/db/repositories/bandwidthRepository'
import * as alertRepo from '@/lib/db/repositories/alertRepository'
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import { resetAllForTests } from '@/lib/utils/rateLimit'
import { resetStatusCacheForTests } from '@/lib/services/routerService'
import { DIALECTS, createTestDb, createUser, destroyTestDb, insertDevice, sessionTokenFor, truncateAll } from '../helpers/db'
import { ctx, req } from '../helpers/request'

import * as devices from '@/app/api/devices/route'
import * as device from '@/app/api/devices/[id]/route'
import * as deviceBandwidth from '@/app/api/devices/[id]/bandwidth/route'
import * as scan from '@/app/api/devices/scan/route'
import * as categories from '@/app/api/categories/route'
import * as current from '@/app/api/bandwidth/current/route'
import * as top from '@/app/api/bandwidth/top-consumers/route'
import * as history from '@/app/api/bandwidth/history/route'
import * as alerts from '@/app/api/alerts/route'
import * as alert from '@/app/api/alerts/[id]/route'
import * as notifications from '@/app/api/notifications/route'
import * as notification from '@/app/api/notifications/[id]/route'
import * as readAll from '@/app/api/notifications/read-all/route'
import * as routerConfig from '@/app/api/router/config/route'
import * as routerTest from '@/app/api/router/test/route'
import * as routerStatus from '@/app/api/router/status/route'
import * as block from '@/app/api/router/device/[id]/block/route'
import * as unblock from '@/app/api/router/device/[id]/unblock/route'
import * as settings from '@/app/api/settings/route'
import * as users from '@/app/api/users/route'
import * as user from '@/app/api/users/[id]/route'
import * as me from '@/app/api/auth/me/route'
import * as logout from '@/app/api/auth/logout/route'
import * as password from '@/app/api/auth/password/route'
import * as login from '@/app/api/auth/login/route'
import * as setup from '@/app/api/setup/route'
import * as setupStatus from '@/app/api/setup/status/route'
import * as health from '@/app/api/health/route'

type Handler = (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>
const ID = '00000000-0000-4000-8000-000000000000'

interface RouteCase {
  name: string
  handler: Handler
  method: string
  path: string
  body?: unknown
  params?: Record<string, string>
  roles: ('ADMIN' | 'MEMBER' | 'VIEWER')[]
}

const ALL = ['ADMIN', 'MEMBER', 'VIEWER'] as RouteCase['roles']
const WRITE = ['ADMIN', 'MEMBER'] as RouteCase['roles']
const ADMIN = ['ADMIN'] as RouteCase['roles']

const ROUTES: RouteCase[] = [
  { name: 'GET /devices', handler: devices.GET as Handler, method: 'GET', path: '/api/devices', roles: ALL },
  { name: 'GET /devices/:id', handler: device.GET as Handler, method: 'GET', path: `/api/devices/${ID}`, params: { id: ID }, roles: ALL },
  { name: 'PATCH /devices/:id', handler: device.PATCH as Handler, method: 'PATCH', path: `/api/devices/${ID}`, params: { id: ID }, body: { deviceName: 'x' }, roles: WRITE },
  { name: 'DELETE /devices/:id', handler: device.DELETE as Handler, method: 'DELETE', path: `/api/devices/${ID}`, params: { id: ID }, roles: ADMIN },
  { name: 'GET /devices/:id/bandwidth', handler: deviceBandwidth.GET as Handler, method: 'GET', path: `/api/devices/${ID}/bandwidth`, params: { id: ID }, roles: ALL },
  { name: 'POST /devices/scan', handler: scan.POST as Handler, method: 'POST', path: '/api/devices/scan', roles: WRITE },
  { name: 'GET /categories', handler: categories.GET as Handler, method: 'GET', path: '/api/categories', roles: ALL },
  { name: 'GET /bandwidth/current', handler: current.GET as Handler, method: 'GET', path: '/api/bandwidth/current', roles: ALL },
  { name: 'GET /bandwidth/top-consumers', handler: top.GET as Handler, method: 'GET', path: '/api/bandwidth/top-consumers', roles: ALL },
  { name: 'GET /bandwidth/history', handler: history.GET as Handler, method: 'GET', path: '/api/bandwidth/history', roles: ALL },
  { name: 'GET /alerts', handler: alerts.GET as Handler, method: 'GET', path: '/api/alerts', roles: ALL },
  { name: 'POST /alerts', handler: alerts.POST as Handler, method: 'POST', path: '/api/alerts', body: { alertType: 'unknown_device' }, roles: WRITE },
  { name: 'PATCH /alerts/:id', handler: alert.PATCH as Handler, method: 'PATCH', path: `/api/alerts/${ID}`, params: { id: ID }, body: { isActive: false }, roles: WRITE },
  { name: 'DELETE /alerts/:id', handler: alert.DELETE as Handler, method: 'DELETE', path: `/api/alerts/${ID}`, params: { id: ID }, roles: WRITE },
  { name: 'GET /notifications', handler: notifications.GET as Handler, method: 'GET', path: '/api/notifications', roles: ALL },
  { name: 'PATCH /notifications/:id', handler: notification.PATCH as Handler, method: 'PATCH', path: `/api/notifications/${ID}`, params: { id: ID }, body: { isRead: true }, roles: ALL },
  { name: 'POST /notifications/read-all', handler: readAll.POST as Handler, method: 'POST', path: '/api/notifications/read-all', roles: ALL },
  { name: 'GET /router/config', handler: routerConfig.GET as Handler, method: 'GET', path: '/api/router/config', roles: ADMIN },
  { name: 'PUT /router/config', handler: routerConfig.PUT as Handler, method: 'PUT', path: '/api/router/config', body: { routerType: 'generic', routerIp: '127.0.0.1', port: 9, username: 'admin', password: 'router-pw-123' }, roles: ADMIN },
  { name: 'POST /router/test', handler: routerTest.POST as Handler, method: 'POST', path: '/api/router/test', roles: ADMIN },
  { name: 'GET /router/status', handler: routerStatus.GET as Handler, method: 'GET', path: '/api/router/status', roles: ALL },
  { name: 'POST /router/device/:id/block', handler: block.POST as Handler, method: 'POST', path: `/api/router/device/${ID}/block`, params: { id: ID }, roles: ADMIN },
  { name: 'POST /router/device/:id/unblock', handler: unblock.POST as Handler, method: 'POST', path: `/api/router/device/${ID}/unblock`, params: { id: ID }, roles: ADMIN },
  { name: 'GET /settings', handler: settings.GET as Handler, method: 'GET', path: '/api/settings', roles: ALL },
  { name: 'PATCH /settings', handler: settings.PATCH as Handler, method: 'PATCH', path: '/api/settings', body: { theme: 'light' }, roles: WRITE },
  { name: 'GET /users', handler: users.GET as Handler, method: 'GET', path: '/api/users', roles: ADMIN },
  { name: 'POST /users', handler: users.POST as Handler, method: 'POST', path: '/api/users', body: { email: 'new@example.test', password: 'long-enough-pw', role: 'VIEWER' }, roles: ADMIN },
  { name: 'PATCH /users/:id', handler: user.PATCH as Handler, method: 'PATCH', path: `/api/users/${ID}`, params: { id: ID }, body: { name: 'x' }, roles: ADMIN },
  { name: 'DELETE /users/:id', handler: user.DELETE as Handler, method: 'DELETE', path: `/api/users/${ID}`, params: { id: ID }, roles: ADMIN },
  { name: 'GET /auth/me', handler: me.GET as Handler, method: 'GET', path: '/api/auth/me', roles: ALL },
  { name: 'POST /auth/password', handler: password.POST as Handler, method: 'POST', path: '/api/auth/password', body: { currentPassword: 'x', newPassword: 'a-new-password' }, roles: ALL },
  { name: 'POST /auth/logout', handler: logout.POST as Handler, method: 'POST', path: '/api/auth/logout', roles: ALL },
]

async function call(route: RouteCase, token?: string, body?: unknown): Promise<Response> {
  return route.handler(req(route.path, { method: route.method, token, body: body ?? route.body }), ctx(route.params ?? {}))
}

describe.each(DIALECTS)('API routes [%s]', (client) => {
  let db: Kysely<DB>
  const tokens: Record<string, string> = {}
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    db = await createTestDb(client)
  })
  beforeEach(async () => {
    await truncateAll(db)
    resetAllForTests()
    resetStatusCacheForTests()
    for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as const) {
      const u = await createUser(role.toLowerCase(), role)
      ids[role] = u.id
      tokens[role] = await sessionTokenFor(u)
    }
  })
  afterAll(async () => {
    await truncateAll(db)
    await destroyTestDb()
  })

  describe('authentication', () => {
    it.each(ROUTES.map((r) => [r.name, r] as const))('%s → 401 without a session', async (_n, route) => {
      const res = await call(route)
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: 'UNAUTHENTICATED' })
    })

    it('rejects and deletes an expired session', async () => {
      const u = await createUser('late', 'ADMIN')
      const token = await sessionTokenFor(u, -1)
      expect((await me.GET(req('/api/auth/me', { token }), ctx())).status).toBe(401)
      const left = await db.selectFrom('sessions').select('id').where('user_id', '=', u.id).execute()
      expect(left).toHaveLength(0)
    })

    it('rejects a deactivated user even with a live session', async () => {
      await db.updateTable('users').set({ is_active: 0 }).where('id', '=', ids.MEMBER as string).execute()
      expect((await me.GET(req('/api/auth/me', { token: tokens.MEMBER }), ctx())).status).toBe(401)
    })
  })

  describe('authorisation: every route re-checks the role (F-62)', () => {
    const denied = ROUTES.flatMap((r) => (['ADMIN', 'MEMBER', 'VIEWER'] as const).filter((role) => !r.roles.includes(role)).map((role) => [`${role} ✗ ${r.name}`, role, r] as const))
    it.each(denied)('%s → 403', async (_n, role, route) => {
      const res = await call(route, tokens[role])
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' })
    })

    const allowed = ROUTES.flatMap((r) => r.roles.map((role) => [`${role} ✓ ${r.name}`, role, r] as const))
    it.each(allowed)('%s → not 401/403', async (_n, role, route) => {
      const res = await call(route, tokens[role])
      expect([401, 403]).not.toContain(res.status)
      expect(res.status).toBeLessThan(500 + (route.name.startsWith('POST /router') || route.name.includes('/router/status') ? 100 : 0))
    })
  })

  describe('envelopes and validation', () => {
    it('lists devices with pagination and byte counters as exact strings (A-05, B-11)', async () => {
      const deviceId = await insertDevice(db)
      const huge = client === 'mysql' ? '9223372036854775000' : '9007199254740991'
      await bandwidthRepo.insertMetrics([{ deviceId, timestamp: new Date(), uploadSpeed: 1.5, downloadSpeed: 12.25, uploadTotal: huge, downloadTotal: '42' }])
      const res = await devices.GET(req('/api/devices', { token: tokens.VIEWER }), ctx())
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toContain(`"uploadBytes":"${huge}"`)
      const body = JSON.parse(text)
      expect(body.pagination).toEqual({ page: 1, pageSize: 50, total: 1 })
      expect(body.data[0]).toMatchObject({ macAddress: 'A4:83:E7:2C:11:09', currentBandwidth: { uploadMbps: 1.5, downloadMbps: 12.25 }, isUnknown: true })
      expect(typeof body.data[0].totalTransferred.uploadMegabytes).toBe('number')
    })

    it.each([
      ['/api/devices?pageSize=101', 'INVALID_QUERY'],
      ['/api/devices?status=sleeping', 'INVALID_QUERY'],
      ['/api/devices?page=0', 'INVALID_QUERY'],
    ])('%s → 400 %s', async (path, code) => {
      const res = await devices.GET(req(path, { token: tokens.ADMIN }), ctx())
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: code, message: expect.any(String) })
    })

    it('refuses 30d at raw resolution', async () => {
      const res = await history.GET(req('/api/bandwidth/history?range=30d&resolution=raw', { token: tokens.ADMIN }), ctx())
      expect(res.status).toBe(400)
    })

    it('rejects malformed JSON, unknown fields and immutable fields', async () => {
      const id = await insertDevice(db)
      const bad = new (await import('next/server')).NextRequest(`http://localhost/api/devices/${id}`, { method: 'PATCH', body: '{nope', headers: { cookie: `snm_session=${tokens.ADMIN}` } })
      expect((await device.PATCH(bad, ctx({ id }))).status).toBe(400)
      const immutable = await device.PATCH(req(`/api/devices/${id}`, { method: 'PATCH', token: tokens.ADMIN, body: { macAddress: '00:11:22:33:44:55' } }), ctx({ id }))
      expect(immutable.status).toBe(400)
      expect(await immutable.json()).toMatchObject({ error: 'INVALID_BODY' })
    })

    it('renames a device and 404s an unknown one', async () => {
      const id = await insertDevice(db)
      const ok = await device.PATCH(req(`/api/devices/${id}`, { method: 'PATCH', token: tokens.MEMBER, body: { deviceName: '  Living Room TV ', deviceType: 'tv' } }), ctx({ id }))
      expect(ok.status).toBe(200)
      expect((await ok.json()).data).toMatchObject({ deviceName: 'Living Room TV', displayName: 'Living Room TV', deviceType: 'tv', isUnknown: false })
      const missing = await device.GET(req(`/api/devices/${ID}`, { token: tokens.MEMBER }), ctx({ id: ID }))
      expect(missing.status).toBe(404)
    })
  })

  describe('secrets never leave (A-09, MEMORY §2.4)', () => {
    it('router config: stored encrypted, returned without any password field', async () => {
      const put = await routerConfig.PUT(req('/api/router/config', { method: 'PUT', token: tokens.ADMIN, body: { routerType: 'asus', routerIp: '192.168.1.1', port: 80, username: 'admin', password: 'hunter2-router' } }), ctx())
      expect(put.status).toBe(200)
      const putText = await put.text()
      expect(putText).not.toMatch(/hunter2|"password"/i)
      expect(JSON.parse(putText).data.hasPassword).toBe(true)

      const row = await db.selectFrom('router_config').select('password_encrypted').executeTakeFirstOrThrow()
      expect(row.password_encrypted).not.toContain('hunter2')
      expect(row.password_encrypted.split(':')).toHaveLength(3)

      const get = await routerConfig.GET(req('/api/router/config?includePassword=true', { token: tokens.ADMIN }), ctx())
      expect(await get.text()).not.toMatch(/hunter2|password_encrypted|"password"/i)
    })

    it('router config cannot be created without a password', async () => {
      const res = await routerConfig.PUT(req('/api/router/config', { method: 'PUT', token: tokens.ADMIN, body: { routerType: 'asus', routerIp: '192.168.1.1', port: 80, username: 'admin' } }), ctx())
      expect(res.status).toBe(400)
    })

    it('user payloads never include a hash', async () => {
      const res = await users.GET(req('/api/users', { token: tokens.ADMIN }), ctx())
      expect(await res.text()).not.toMatch(/hash/i)
    })
  })

  describe('owner scoping (F-34)', () => {
    it("another user's rule is 404 (not 403); admin may act on it; list is mine-only", async () => {
      const created = await alerts.POST(req('/api/alerts', { method: 'POST', token: tokens.MEMBER, body: { alertType: 'bandwidth_exceeded', threshold: 25, userId: ids.ADMIN } }), ctx())
      expect(created.status).toBe(400) // unknown field `userId` refused: owner comes from the session only
      const ok = await alerts.POST(req('/api/alerts', { method: 'POST', token: tokens.MEMBER, body: { alertType: 'bandwidth_exceeded', threshold: 25 } }), ctx())
      expect(ok.status).toBe(201)
      const rule = (await ok.json()).data
      expect(rule.userId).toBe(ids.MEMBER)

      const other = await createUser('other', 'MEMBER')
      const otherToken = await sessionTokenFor(other)
      expect((await alert.PATCH(req(`/api/alerts/${rule.id}`, { method: 'PATCH', token: otherToken, body: { isActive: false } }), ctx({ id: rule.id }))).status).toBe(404)
      expect((await alert.DELETE(req(`/api/alerts/${rule.id}`, { method: 'DELETE', token: otherToken }), ctx({ id: rule.id }))).status).toBe(404)
      expect((await (await alerts.GET(req('/api/alerts', { token: otherToken }), ctx())).json()).data).toHaveLength(0)
      expect((await (await alerts.GET(req('/api/alerts', { token: tokens.ADMIN }), ctx())).json()).data).toHaveLength(0)
      expect((await (await alerts.GET(req('/api/alerts?scope=all', { token: tokens.ADMIN }), ctx())).json()).data).toHaveLength(1)
      expect((await alerts.GET(req('/api/alerts?scope=all', { token: tokens.MEMBER }), ctx())).status).toBe(403)
      expect((await alert.PATCH(req(`/api/alerts/${rule.id}`, { method: 'PATCH', token: tokens.ADMIN, body: { isActive: false } }), ctx({ id: rule.id }))).status).toBe(200)
      expect((await alertRepo.findById(rule.id))?.isActive).toBe(false)
    })

    it('notifications: list, acknowledge and read-all only ever touch the caller', async () => {
      const mine = await notificationRepo.create({ userId: ids.VIEWER as string, deviceId: null, alertId: null, title: 'mine', message: 'm', type: 'info', priority: 'low', data: null })
      const theirs = await notificationRepo.create({ userId: ids.MEMBER as string, deviceId: null, alertId: null, title: 'theirs', message: 't', type: 'info', priority: 'low', data: null })

      const list = await (await notifications.GET(req('/api/notifications', { token: tokens.VIEWER }), ctx())).json()
      expect(list.data.map((n: { title: string }) => n.title)).toEqual(['mine'])
      expect(list.unreadCount).toBe(1)

      expect((await notification.PATCH(req(`/api/notifications/${theirs.id}`, { method: 'PATCH', token: tokens.VIEWER, body: { isRead: true } }), ctx({ id: theirs.id }))).status).toBe(404)
      expect((await notification.PATCH(req(`/api/notifications/${mine.id}`, { method: 'PATCH', token: tokens.VIEWER, body: { isRead: true } }), ctx({ id: mine.id }))).status).toBe(200)

      await readAll.POST(req('/api/notifications/read-all', { method: 'POST', token: tokens.VIEWER }), ctx())
      expect((await notificationRepo.findByIdForUser(theirs.id, ids.MEMBER as string))?.isRead).toBe(false)
    })

    it('settings: MEMBER may change personal fields but not network-wide ones', async () => {
      const personal = await settings.PATCH(req('/api/settings', { method: 'PATCH', token: tokens.MEMBER, body: { notifyHighBandwidth: true, bandwidthThreshold: 42 } }), ctx())
      expect(personal.status).toBe(200)
      expect((await personal.json()).data).toMatchObject({ notifyHighBandwidth: true, bandwidthThreshold: 42 })
      const network = await settings.PATCH(req('/api/settings', { method: 'PATCH', token: tokens.MEMBER, body: { scanIntervalSeconds: 60 } }), ctx())
      expect(network.status).toBe(403)
      const admin = await settings.PATCH(req('/api/settings', { method: 'PATCH', token: tokens.ADMIN, body: { scanIntervalSeconds: 60, dataRetentionDays: 14 } }), ctx())
      expect(admin.status).toBe(200)
      const memberView = await (await settings.GET(req('/api/settings', { token: tokens.MEMBER }), ctx())).json()
      expect(memberView.data).toMatchObject({ scanIntervalSeconds: 60, dataRetentionDays: 14, bandwidthThreshold: 42 })
      const invalid = await settings.PATCH(req('/api/settings', { method: 'PATCH', token: tokens.ADMIN, body: { scanIntervalSeconds: 10, networkSubnet: '10.0.0.0' } }), ctx())
      expect(invalid.status).toBe(400)
    })
  })

  describe('users', () => {
    it('refuses to remove the last active admin, and your own account', async () => {
      const demote = await user.PATCH(req(`/api/users/${ids.ADMIN}`, { method: 'PATCH', token: tokens.ADMIN, body: { role: 'MEMBER' } }), ctx({ id: ids.ADMIN as string }))
      expect(demote.status).toBe(409)
      const self = await user.DELETE(req(`/api/users/${ids.ADMIN}`, { method: 'DELETE', token: tokens.ADMIN }), ctx({ id: ids.ADMIN as string }))
      expect(self.status).toBe(409)
      const dup = await users.POST(req('/api/users', { method: 'POST', token: tokens.ADMIN, body: { email: 'member@example.test', password: 'long-enough-pw' } }), ctx())
      expect(dup.status).toBe(409)
    })
  })

  describe('auth flows', () => {
    it('setup is public until a user exists, then 409 (F-63)', async () => {
      expect((await setupStatus.GET(req('/api/setup/status'), ctx())).status).toBe(409)
      expect((await setup.POST(req('/api/setup', { method: 'POST', body: { email: 'x@example.test', password: 'long-enough-pw' } }), ctx())).status).toBe(409)
      await truncateAll(db)
      expect((await setupStatus.GET(req('/api/setup/status'), ctx())).status).toBe(200)
      const res = await setup.POST(req('/api/setup', { method: 'POST', body: { email: 'First@Example.test', password: 'long-enough-pw' } }), ctx())
      expect(res.status).toBe(201)
      expect((await res.json()).data).toMatchObject({ email: 'first@example.test', role: 'ADMIN' })
      const cookie = res.headers.get('set-cookie') ?? ''
      expect(cookie).toMatch(/snm_session=/)
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=lax/i)
    }, 20_000)

    it('login: same answer for unknown email and wrong password; throttled after 5 failures', async () => {
      await setup.POST(req('/api/setup', { method: 'POST', body: { email: 'boss@example.test', password: 'long-enough-pw' } }), ctx()).catch(() => undefined)
      await truncateAll(db)
      await setup.POST(req('/api/setup', { method: 'POST', body: { email: 'boss@example.test', password: 'long-enough-pw' } }), ctx())
      resetAllForTests()
      const attempt = (email: string, pw: string, ip = '10.1.1.1') => login.POST(req('/api/auth/login', { method: 'POST', body: { email, password: pw }, ip }), ctx())

      const unknown = await attempt('nobody@example.test', 'whatever')
      const wrong = await attempt('boss@example.test', 'wrong-password')
      expect(unknown.status).toBe(401)
      expect(await unknown.json()).toEqual(await wrong.json())

      const ok = await attempt('BOSS@example.test', 'long-enough-pw')
      expect(ok.status).toBe(200) // success resets the counter
      for (let i = 0; i < 5; i++) expect((await attempt('boss@example.test', 'nope')).status).toBe(401)
      const throttled = await attempt('boss@example.test', 'long-enough-pw')
      expect(throttled.status).toBe(429)
      expect(throttled.headers.get('Retry-After')).toMatch(/^\d+$/)
      expect((await attempt('boss@example.test', 'long-enough-pw', '10.9.9.9')).status).toBe(200) // per IP
    }, 30_000)

    it('logout invalidates the session server-side', async () => {
      const res = await logout.POST(req('/api/auth/logout', { method: 'POST', token: tokens.MEMBER }), ctx())
      expect(res.status).toBe(204)
      expect((await me.GET(req('/api/auth/me', { token: tokens.MEMBER }), ctx())).status).toBe(401)
    })

    it('health is public and reports the database', async () => {
      const res = await health.GET()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ status: 'ok', database: { client, connected: true } })
    })
  })
})
