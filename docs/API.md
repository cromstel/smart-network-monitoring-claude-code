# API Reference

Base: `/api` · JSON in, JSON out · authenticated by session cookie.

Every route except `/api/health`, `/api/auth/login`, and `/api/setup` requires a valid session. Each handler re-checks the caller's role — middleware alone is not authorisation (`PRD` F-62).

---

## Envelopes

Collection:
```json
{ "data": [ ... ], "pagination": { "page": 1, "pageSize": 50, "total": 128 } }
```

Single resource:
```json
{ "data": { ... } }
```

Error:
```json
{ "error": "INVALID_QUERY", "message": "pageSize must be between 1 and 100.", "details": {} }
```

| Code | HTTP |
|---|---|
| `INVALID_QUERY`, `INVALID_BODY` | 400 |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `RATE_LIMITED` | 429 |
| `ROUTER_UNREACHABLE`, `ROUTER_UNSUPPORTED`, `SCANNER_UNAVAILABLE` | 503 |
| `INTERNAL` | 500 |

Never return a raw exception message. Log it with context; return `INTERNAL` with a generic sentence.

---

## Roles

| Role | Can |
|---|---|
| `ADMIN` | Everything, including users and router configuration |
| `MEMBER` | Read all; rename devices; manage own alerts |
| `VIEWER` | Read only |

---

## Health

### `GET /api/health` — public
```json
{ "status": "ok", "version": "1.0.0", "uptimeSeconds": 3600,
  "database": { "client": "mysql", "connected": true },
  "scanner": { "mode": "arp", "lastScanAt": "2026-09-24T10:00:00.000Z", "healthy": true } }
```
Returns 503 with `"status": "degraded"` if the database is unreachable. Intended for container healthchecks and uptime monitoring.

---

## Auth

### `POST /api/auth/login` — public, rate-limited
```json
{ "email": "admin@example.com", "password": "..." }
```
Sets the session cookie. Returns the user without `passwordHash`. Invalid credentials return 401 with `UNAUTHENTICATED` and the same message regardless of whether the email exists — do not confirm account existence.

### `POST /api/auth/logout` — any role
Invalidates the session and clears the cookie. 204.

### `GET /api/auth/me` — any role
The current user and role.

### `GET /api/setup/status` · `POST /api/setup` — public until first user exists
Creates the initial ADMIN (`201`) and signs them in (sets the session cookie). `GET` returns `{ "data": { "needsSetup": true } }`. Both return 409 `CONFLICT` once any user exists.

### `POST /api/auth/password` — any role
```json
{ "currentPassword": "...", "newPassword": "at least 10 chars" }
```
204. A wrong current password is `400 INVALID_BODY` with a field error (403 is reserved for role denial).

---

## Devices

### `GET /api/devices` — any role
Query: `status` (`online|offline|idle`) · `type` · `search` (name, hostname, IP, MAC, vendor) · `categoryId` · `includeIgnored` (`true|false`, default false) · `sort` (`name|lastSeen|bandwidth`, default `lastSeen`) · `order` (`asc|desc`) · `page` · `pageSize` (max 100).

```json
{ "data": [{
    "id": "8f14e45f-...", "macAddress": "A4:83:E7:2C:11:09", "ipAddress": "192.168.1.42",
    "hostname": "anas-iphone", "deviceName": "Ana's iPhone", "displayName": "Ana's iPhone", "deviceType": "phone",
    "manufacturer": "Apple, Inc.", "status": "online", "signalStrength": -52,
    "firstSeen": "2026-08-01T09:12:00.000Z", "lastSeen": "2026-09-24T10:00:00.000Z",
    "totalConnectionTimeSeconds": 1840233, "isBlocked": false, "isIgnored": false,
    "isUnknown": false, "categoryId": null,
    "currentBandwidth": { "uploadMbps": 0.8, "downloadMbps": 12.4 },
    "totalTransferred": { "uploadBytes": "8402931200", "downloadBytes": "91238471123",
                          "uploadMegabytes": 8402.93, "downloadMegabytes": 91238.47 }
  }],
  "pagination": { "page": 1, "pageSize": 50, "total": 12 } }
```

Byte counters are **strings**. They exceed `Number.MAX_SAFE_INTEGER` and `JSON.stringify` throws on a JS `bigint` (`AUDIT.md` A-05). A `…Megabytes` number accompanies each for display. Speeds are numbers in Mbps. `currentBandwidth` is `null` when the device is offline, when the scanner cannot measure traffic (ARP, ASUS client list), or when no sample is fresher than 3 scan intervals. `isUnknown` is `deviceName === null`.

### `GET /api/devices/{id}` — any role
As above plus `category`, the 20 most recent `connectionLogs`, and `stats` (peak speeds, average session length, session count).

### `PATCH /api/devices/{id}` — ADMIN, MEMBER
```json
{ "deviceName": "Living Room TV", "deviceType": "tv", "categoryId": null, "isIgnored": false }
```
All fields optional. Immutable: `macAddress`, `ipAddress`, `firstSeen`, `status`.

### `DELETE /api/devices/{id}` — ADMIN
Removes the device and cascades its metrics, logs, and alerts. 204. An active device reappears on the next scan — use `isIgnored` to hide one permanently.

### `POST /api/devices/scan` — ADMIN, MEMBER
Triggers a scan outside the schedule. Returns when complete.
```json
{ "data": { "scanner": "arp", "durationMs": 4210, "devicesFound": 12, "newDevices": 1, "wentOffline": 0 } }
```
503 `SCANNER_UNAVAILABLE` if no scanner can run. Concurrent calls return 409 `CONFLICT` rather than queuing — a second simultaneous ARP sweep degrades both.

---

## Bandwidth

### `GET /api/categories` — any role
Device categories, for recategorising (`PATCH /api/devices/{id}` with `categoryId`).

### `GET /api/devices/{id}/bandwidth` — any role
Query: `range` (`1h|24h|7d|30d`, default `24h`) · `resolution` (`raw|hourly`, defaults to `raw` for 1h/24h and `hourly` beyond).

```json
{ "data": { "deviceId": "...", "range": "24h", "resolution": "raw",
    "points": [{ "timestamp": "2026-09-24T09:00:00.000Z",
                 "uploadMbps": 0.4, "downloadMbps": 8.1,
                 "uploadBytes": "184320", "downloadBytes": "3727360" }] } }
```
`30d` at `raw` returns 400 — the point count is unbounded. Use `hourly`.

### `GET /api/bandwidth/current` — any role
Network-wide instantaneous throughput and device counts:
```json
{ "data": { "uploadMbps": 8.5, "downloadMbps": 49.9, "onlineDevices": 11, "totalDevices": 12,
            "unknownDevices": 2, "peakTodayUploadMbps": 14.5, "peakTodayDownloadMbps": 125.8,
            "sampledAt": "2026-09-24T18:58:24.257Z" } }
```

### `GET /api/bandwidth/top-consumers` — any role
Query: `range` (default `24h`) · `limit` (default 5, max 20). Devices ranked by bytes transferred.

### `GET /api/bandwidth/history` — any role
Network-wide time series. Same `range`/`resolution` rules as the per-device route.

---

## Alerts and notifications

### `GET /api/alerts` — any role
Returns **only the caller's own alert rules.** Never all rules, not even for an ADMIN, unless `?scope=all` is passed and the caller is an ADMIN (`PRD` F-34).

### `POST /api/alerts` — ADMIN, MEMBER
```json
{ "alertType": "bandwidth_exceeded", "deviceId": "8f14e45f-...", "threshold": 50, "isActive": true }
```
`deviceId: null` applies the rule to all devices. `threshold` is required for `bandwidth_exceeded`, ignored otherwise. Owner is taken from the session — never from the body.

### `PATCH /api/alerts/{id}` · `DELETE /api/alerts/{id}` — owner or ADMIN
A non-owner gets 404, not 403. Returning 403 confirms the rule exists and leaks another user's configuration.

### `GET /api/notifications` — any role
Query: `isRead` · `type` (`info|success|warning|error`) · `from` · `to` (ISO dates) · `page` · `pageSize`. Scoped to the caller — no parameter widens it. Includes a top-level `unreadCount`.

### `PATCH /api/notifications/{id}` — any role, owner only
`{ "isRead": true }` acknowledges; `false` un-acknowledges. Another user's notification is 404.

### `POST /api/notifications/read-all` — any role
Marks every notification for the caller as read. Returns the count updated.

---

## Router

### `GET /api/router/config` — ADMIN
Returns the configuration **without any password field.** There is no query parameter, header, or role that includes it (`AUDIT.md` A-09).

### `PUT /api/router/config` — ADMIN
```json
{ "routerType": "asus", "routerIp": "192.168.1.1", "port": 80,
  "username": "admin", "password": "..." }
```
The password is encrypted with AES-256-GCM before it reaches the database and is never echoed back.

### `POST /api/router/test` — ADMIN
Tests connectivity using either the submitted credentials or the stored ones. Returns reachability, model, and firmware — never the credentials.

### `GET /api/router/status` — any role
`{ configured, reachable, routerType, modelNumber, firmwareVersion, lastCheckAt, lastSuccessAt }` (checked at most every 30 s). `configured: false` is a normal 200. 503 `ROUTER_UNREACHABLE` when a configured router cannot be reached, with the same object in `details`, so the dashboard shows a degraded state rather than failing.

### `POST /api/router/device/{id}/block` · `.../unblock` — ADMIN
Requires a configured router that supports blocking. 503 `ROUTER_UNSUPPORTED` otherwise — which is every router in v1.0 (F-44 is P2); the route exists so the contract is stable.

---

## Settings

### `GET /api/settings` — any role
The caller's settings.

### `PATCH /api/settings` — ADMIN, MEMBER
Personal fields (`notify*`, `bandwidthThreshold`, `theme`) change the caller's own row. Network-wide fields (`scanIntervalSeconds`, `dataRetentionDays`, `networkSubnet`, `ignoreSubnets`) describe the one monitored network: **ADMIN only** (a MEMBER gets 403), applied to every user's row.
```json
{ "scanIntervalSeconds": 30, "dataRetentionDays": 30,
  "networkSubnet": "192.168.1.0/24", "notifyNewDevices": true,
  "bandwidthThreshold": 100, "theme": "dark" }
```
`scanIntervalSeconds` 30–3600 · `dataRetentionDays` 1–365 · `networkSubnet` valid IPv4 CIDR /8–/32 · `ignoreSubnets` up to 20 CIDRs · `theme` `dark|light|system`. Changing the interval reschedules the scan timer without a restart.

`notifyNewDevices`, `notifyDeviceOffline` and `notifyHighBandwidth` (+ `bandwidthThreshold`) are **built-in alerts for the caller**, independent of alert rules. A user matched by both a rule and a toggle receives one notification.

---

## Users — ADMIN

### `GET /api/users` · `POST /api/users`
```json
{ "email": "sam@example.com", "password": "at least 10 chars", "name": "Sam", "role": "MEMBER" }
```
`201`; 409 if the email exists. No payload ever contains a password hash.

### `PATCH /api/users/{id}` · `DELETE /api/users/{id}`
`{ "name", "role", "isActive", "password" }`, all optional. Deactivating a user or resetting their password ends their sessions. 409 for any change that would leave no active ADMIN, and for deleting yourself.

---

## Live updates

### `GET /api/events` — any role, `text/event-stream`

```
event: device.connected
data: {"deviceId":"8f14e45f-...","macAddress":"A4:83:E7:2C:11:09","isNew":true}

event: bandwidth.tick
data: {"uploadMbps":4.2,"downloadMbps":88.1,"onlineDevices":11}

event: alert.raised
data: {"notificationId":"...","title":"Unknown device","priority":"high"}
```

Events: `device.connected` · `device.disconnected` · `device.updated` · `bandwidth.tick` · `alert.raised` · `scan.completed`.

A keep-alive comment every 30 seconds prevents proxy timeouts. Events are scoped to the subscribing user — `alert.raised` is only sent to the owner of the triggering rule.

Clients treat an event as an invalidation signal, not as data: the handler invalidates a TanStack Query key and lets the refetch supply the payload. One code path regardless of how the update arrived (`ARCHITECTURE.md` §6).

---

## Rate limits

| Scope | Limit |
|---|---|
| `/api/auth/login` | 5 per 15 min per IP |
| `/api/devices/scan` | 1 concurrent, 10 per hour |
| Everything else | 120 per minute per session |

`429` includes a `Retry-After` header.
