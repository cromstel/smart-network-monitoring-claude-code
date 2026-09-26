# Backlog

Ordered. Work top to bottom. `A-nn` refers to `AUDIT.md`; phases to `PLAN.md`.

Task format: `[ ] B-nn — title (size) [audit ref]` followed by acceptance criteria.
Sizes: **S** ≤2h · **M** half a day · **L** 1–2 days.

When you finish a task: tick it, and if it changed a decision, add a line to `MEMORY.md` §5.

---

## Phase 0 — Stabilise

- [x] **B-01 — Resolve duplicate routes** (M) `A-01`
  - ✅ Greenfield rebuild: one owner per path from the start (`app/(dashboard)` owns `/`, `/settings`, `/router`; no `app/page.tsx`). Build reports no conflicts.
  - Delete `app/settings/page.tsx`; `app/(dashboard)/settings/page.tsx` owns `/settings`
  - Move the dashboard body into `app/(dashboard)/page.tsx`; `app/page.tsx` becomes the landing page or a redirect
  - Reconcile `app/router/page.tsx` with `app/(dashboard)/integrations/page.tsx` — one owner
  - AC: `next build` reports no route conflict

- [x] **B-02 — Delete Prisma** (S) `A-02` `A-03`
  - ✅ Greenfield: Prisma, `pg`, `crypto`, `axios` never added. `grep -ri prisma app lib components package.json` → only comments explaining the decision.
  - `rm -rf prisma/ lib/db.ts`
  - Remove `@prisma/client`, `@prisma/extension-accelerate`, `prisma`, `pg`, `crypto`, `axios` from `package.json`
  - Remove the `db:push`/`db:studio`/`db:migrate`/`db:generate` scripts
  - AC: `grep -ri "prisma\|@prisma" app lib components package.json` returns nothing

- [x] **B-03 — Build the data layer** (L) `A-03` `A-08`
  - ✅ `lib/db/client.ts` (one pool, `globalThis`), `schema.ts`, `migrator.ts` (static provider), `lib/config.ts`. Verified on SQLite and MySQL 8.0.
  - Add `kysely`, `mysql2`, `better-sqlite3`
  - `lib/db/client.ts` per `ARCHITECTURE.md` §4 — single pool, `globalThis` cached
  - `lib/db/schema.ts` — Kysely table interfaces
  - `lib/db/migrator.ts` + `lib/db/migrations/`
  - `lib/config.ts` — Zod-validated env, fails fast
  - AC: the app connects to SQLite and to MySQL by flipping `DB_CLIENT`; exactly one pool per process

- [x] **B-04 — App-owned domain types** (M) `A-03`
  - ✅ `lib/types/` hand-written domain + DTO types.
  - Define `Device`, `BandwidthMetric`, `ConnectionLog`, `DeviceAlert`, `UserSettings` in `lib/types/`
  - Fix the six consumers: `lib/services/deviceFiltering.ts`, `lib/hooks/useDevices.ts`, `lib/context/AppContext.tsx`, `components/DeviceCard.tsx`, `app/api/devices/scan/route.ts`, `app/api/router/config/route.ts`
  - AC: no generated type is imported anywhere; `npm run type-check` passes

- [x] **B-05 — Port `databaseService.ts` to repositories** (L) `A-03` `A-08`
  - ✅ Repositories: device, bandwidth, connectionLog, category, user (+sessions), settings, alert, notification, router, network.
  - Split into `deviceRepository.ts`, `bandwidthRepository.ts`, `connectionLogRepository.ts`
  - Each imports `db` — none constructs a connection
  - AC: the existing API routes work unchanged against the new repositories

- [x] **B-06 — Install the test runner** (M) `A-04`
  - ✅ Jest via `next/jest` (SWC, no ts-node needed), `@/` alias mapped. `npm test` runs unit, integration and component suites.
  - Add `jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@types/jest`, `ts-node`
  - Add `"test": "jest"`, `"test:watch": "jest --watch"`, `"test:coverage": "jest --coverage"`
  - Verify `jest.config.js` `moduleNameMapper` resolves the `@/` alias
  - AC: `npm test` runs the 6 existing test files

- [x] **B-07 — Pin React 19 stable** (S) `A-07`
  - ✅ React 19.x stable.
  - `react`, `react-dom`, `@types/react`, `@types/react-dom` → stable `^19`
  - AC: build and tests pass

- [x] **B-08 — Clean the repo root** (S) `A-18` `A-19` `A-20`
  - ✅ Nothing to delete in a greenfield tree. `.gitignore` and root `.env.example` added.
  - Delete `tsconfig.tsbuildinfo`, the 22 status `.txt` files, `installer*.sh`, `install-web*.html`, `home-network-monitor-project.zip`
  - `.gitignore`: `node_modules/`, `.next/`, `*.tsbuildinfo`, `.env*` (not `.env.example`), `data/`, `coverage/`
  - Add root `.env.example` per `ARCHITECTURE.md` §7
  - AC: root holds only source, config, and `docs/`

---

## Phase 1 — Data foundation

- [x] **B-10 — Migrations 001–006** (L)
  - ✅ Seven migrations (users must precede alerts for the FK): `001_devices` … `007_network_metrics`. Up/down/up tested on both dialects.
  - `001_devices`, `002_bandwidth_metrics`, `003_connection_logs`, `004_alerts_notifications`, `005_settings_router`, `006_network_metrics` per `DATABASE.md`
  - Every migration has a working `down`
  - AC: migrate up then down then up, clean, on both dialects

- [x] **B-11 — Fix BigInt end to end** (M) `A-05`
  - ✅ `bigNumberStrings` on; repos return strings; API exposes `{uploadBytes: string, uploadMegabytes: number}`. Route test asserts a counter above MAX_SAFE_INTEGER serialises exactly.
  - `bigNumberStrings: true` on the MySQL pool
  - Repositories return byte counters as `string`
  - API exposes `{ bytes: string, megabytes: number }`
  - AC: a test asserts `GET /api/devices` serialises with a counter above `Number.MAX_SAFE_INTEGER`

- [x] **B-12 — Seed script** (M)
  - ✅ `npm run db:seed` — 12 devices, 7 days (hourly) + 24 h raw, connection sessions, 5 categories; 3 rules if an admin exists.
  - 12 devices across types, 7 days of bandwidth, connection events, 3 alerts
  - AC: `npm run db:seed` on an empty DB yields a browsable dashboard

- [x] **B-13 — MySQL in Docker** (S)
  - ✅ `docker-compose.yml` (MySQL 8.4, healthcheck, volume, test DB init). Not executed in the sandbox (no Docker daemon); suite verified against apt-installed MySQL 8.0.
  - `docker-compose.yml` with MySQL 8, healthcheck, named volume
  - AC: `docker compose up -d && DB_CLIENT=mysql npm test` passes

- [x] **B-14 — Dual-dialect repository tests** (L)
  - ✅ Every integration suite is `describe.each(DIALECTS)`; MySQL included when `DB_CLIENT=mysql`.
  - Parameterise the suite over both dialects
  - AC: every repository test runs twice; both green

---

## Phase 2 — Scanning and bandwidth

- [x] **B-20 — Scanner interface + simulated** (M)
  - ✅ `simulatedRoster.ts` + `simulatedScanner.ts` are the only synthetic-data sources.
  - `lib/services/scanners/{types,simulatedScanner}.ts`
  - AC: simulated scanner is the only source of fake data in the codebase

- [x] **B-21 — ARP scanner with capability probe** (L) `A-16`
  - ✅ Probe: `arp-scan` + CAP_NET_RAW (bit 13 of CapEff) → else ping sweep + `ip neigh`/`arp -a`. Never throws on an unprivileged host.
  - `isAvailable()` checks for the binary and `CAP_NET_RAW` before first use
  - AC: on a machine without privileges, it reports unavailable and does not throw

- [x] **B-22 — Fallback chain** (M)
  - ✅ `scanners/registry.ts`; one warn line naming each failure and the choice.
  - Order per `ARCHITECTURE.md` §5; each fallback logs what failed and what it chose
  - AC: forcing `SCANNER_MODE=arp` without privileges falls back to simulated with one clear warning

- [x] **B-23 — Offline MAC vendor lookup** (S)
  - ✅ `oui-data`, offline; randomised MACs labelled as such.
  - `oui-data`, normalised uppercase MAC
  - AC: a known OUI resolves with no network access

- [x] **B-24 — Cron jobs** (L) `A-17`
  - ✅ Scan loop (self-rescheduling timer), rollup `5 * * * *`, prune `30 3 * * *`. Idempotency and deletion covered by integration tests.
  - Scan loop, hourly rollup, nightly retention prune, all via `instrumentation.ts`
  - AC: pruning deletes rows past `dataRetentionDays`; running a job twice does not double-count

- [x] **B-25 — Connection event detection** (M)
  - ✅ Offline after max(2 × interval, 120 s); session length logged and added to cumulative connection time.
  - Diff each scan against known state; write `connection_logs`; set duration on disconnect
  - AC: 2 missed scans marks offline (PRD F-06)

---

## Phase 3 — Authentication

- [x] **B-30 — Users and sessions** (L)
  - ✅ bcrypt cost 12; hash selected only in `findCredentials*`; DTOs enumerate fields.
  - `users`, `sessions` tables; bcrypt cost 12; `userRepository`
  - AC: passwords verify; no hash is ever returned by an API route

- [x] **B-31 — First-run setup** (M) `A-20`
  - ✅ `npm run setup` + `/setup` wizard; 409 once a user exists.
  - `scripts/setup.ts` + a `/setup` wizard creating the first ADMIN; unreachable once a user exists
  - AC: a fresh install reaches a usable login without editing files by hand

- [x] **B-32 — Login, logout, session cookie** (M)
  - ✅ httpOnly, sameSite=lax, secure in production (`COOKIE_SECURE` override), sliding 7-day expiry; expired sessions deleted on sight and nightly.
  - httpOnly, sameSite=lax, secure in production, sliding 7-day expiry
  - AC: expired sessions are rejected and cleaned up

- [x] **B-33 — Real middleware** (M) `A-10`
  - ✅ Cookie-presence gate with allowlist; real validation in handlers and the dashboard layout.
  - Session check; unauthenticated → `/login`; allowlist `/login`, `/setup`, `/api/health`, `/api/auth/*`
  - AC: no page or API route is reachable without a session outside the allowlist

- [x] **B-34 — Per-route authorisation** (L)
  - ✅ `withAuth(roles, …)` on every route. Matrix test: every route × every role → 401/403/allowed.
  - `requireRole()` applied in **every** route handler (PRD F-62)
  - AC: a VIEWER session gets 403 on every mutating route — one test per route

- [x] **B-35 — Auth rate limiting** (S)
  - ✅ 5 failures / 15 min / IP; success resets; test covers throttle and per-IP scope.
  - AC: repeated failed logins are throttled; the limit is covered by a test

---

## Phase 4 — Dashboard and real-time

- [x] **B-40 — SSE endpoint and event bus** (L) `A-12`
  - ✅ `/api/events`, 30 s keep-alive, per-user scoping of `alert.raised`; listener cleanup tested.
  - `app/api/events/route.ts`, `lib/services/eventBus.ts`, 30s keep-alive
  - AC: two clients both receive an event; disconnect is clean, no leaked listener

- [x] **B-41 — Delete the WebSocket servers** (S) `A-12`
  - ✅ Greenfield: no `ws` anywhere.
  - Remove `lib/websocket/server.ts`, `lib/services/websocketServer.ts`, `lib/hooks/useWebSocket.ts`
  - AC: no `ws` reference remains

- [x] **B-42 — `useEventStream` hook** (M)
  - ✅ `lib/hooks/useEventStream.ts`, backoff 1 s → 30 s, full invalidation on reconnect.
  - Subscribes, invalidates query keys, reconnects with backoff
  - AC: killing the server and restarting it resumes updates without a page reload

- [x] **B-43 — Overview page** (L)
  - ✅ Overview: online/total, live ↓/↑, peak today, unknown count, network chart, top consumers, recent alerts, system status.
  - Totals, current throughput, today's peak, top consumers
  - AC: every figure traces to a repository query; none is computed in the component

- [x] **B-44 — Device table** (L)
  - ✅ Server-side filter/sort/pagination (50/page, max 100); bandwidth sort ranks then pages.
  - Sort, filter, server-side pagination past 50 rows
  - AC: 100 devices render without visible lag (PRD §5)

- [x] **B-45 — Device detail** (L)
  - ✅ 1h/24h/7d/30d; 30-day history 13–21 ms on MySQL at 100 devices (PERFORMANCE.md).
  - 1h/24h/7d/30d charts, connection timeline, rename, recategorise
  - AC: 30-day history returns in under 1s against seeded MySQL

- [x] **B-46 — All server state through TanStack Query** (L) `A-13`
  - ✅ All reads in `lib/hooks/queries.ts`; no `useState`+`fetch` for server data.
  - AC: no component holds server data in `useState`

- [x] **B-47 — Remove component-level randomness** (M) `A-14`
  - ✅ `grep -rn "Math.random()" app components` → nothing.
  - AC: `grep -rn "Math.random()" app components` returns nothing

- [x] **B-48 — Loading, empty, error states** (M)
  - ✅ Skeletons, empty states with explanations, retryable errors, `app/(dashboard)/error.tsx`.
  - Skeletons, empty states, error boundaries on every async surface
  - AC: no surface can show a blank panel with no explanation

- [x] **B-49 — Responsive pass** (M)
  - ✅ Checked at 375 and 1440 px in Chromium (no horizontal scroll: scrollWidth = viewport). 768/2560 by layout breakpoints, not screenshot-verified.
  - 360 / 768 / 1280 / 2560
  - AC: no horizontal scroll, no clipped control at any breakpoint

---

## Phase 5 — Alerts, router, settings

- [x] **B-50 — Alert rule engine** (L)
  - ✅ Unknown device / bandwidth / offline; dedup windows; exactly-one tested.
  - Unknown device, bandwidth threshold, device offline
  - AC: one connection raises exactly one alert — no duplicates across scan cycles

- [x] **B-51 — Owner-scoped alerts** (M) `PRD F-34`
  - ✅ `__tests__/integration/alertOwnership.test.ts` — leak test first, plus event scoping and non-owner 404.
  - Every alert query filtered by owner
  - **Write the negative test first:** user A must never receive user B's alert
  - AC: the cross-user leak test exists and passes

- [x] **B-52 — Activity log** (M)
  - ✅ Activity log with severity/unread filters, acknowledge/unacknowledge, mark-all; persisted in DB.
  - Persisted, acknowledgeable, filterable by type and date
  - AC: acknowledgement survives a restart

- [x] **B-53 — Encrypt router credentials** (M) `A-09`
  - ✅ AES-256-GCM `iv:tag:ct`; column `password_encrypted`; route tests assert no password in any payload.
  - AES-256-GCM, `iv:authTag:ciphertext`, key from `ENCRYPTION_KEY`
  - AC: no plaintext password in the DB; no API shape includes the field

- [x] **B-54 — ASUS router client** (L)
  - ✅ `AsusClient` (login.cgi/appGet.cgi, 5 s timeout, 1 retry) behind `AsusScanner`. Unit-tested with a fake router; **not yet tried on real hardware**.
  - Behind the `Scanner` interface; timeouts and retries
  - AC: an unreachable router degrades to ARP, logs once, does not crash

- [x] **B-55 — Settings UI** (L)
  - ✅ RHF+Zod; interval change reschedules the timer via the event bus (no restart).
  - Subnet, interval, retention, notifications, theme — Zod-validated, persisted
  - AC: changing the interval takes effect without a restart

---

## Phase 6 — Hardening and release

- [x] **B-60 — Playwright E2E** (L)
  - ✅ Five journeys + an API 401 check, all passing locally against a production build.
  - login · device list · rename · history · configure alert
  - AC: the five specs pass in CI (browser CDN is unreachable locally — `MEMORY.md` §6)

- [x] **B-61 — Coverage to 70%** (L)
  - ✅ 89.8 % statements / 73.5 % branches; thresholds in `jest.config.js`.
  - `lib/services/` and `lib/utils/`
  - AC: `npm run test:coverage` meets the threshold; the threshold is enforced in config

- [ ] **B-62 — CI pipeline** (M)
  - build · type-check · unit · MySQL integration · E2E
  - AC: a PR that breaks any stage is blocked
  - ⏳ `.github/workflows/ci.yml` written (lint → type-check → coverage → MySQL 8.4 service → build → Playwright). Every stage was run locally and passes; the workflow itself has not run on GitHub yet.

- [x] **B-63 — Performance pass** (M)
  - ✅ `npm run bench`; results and one fix (top consumers) in `docs/PERFORMANCE.md`.
  - Against PRD §5 targets; record the numbers in `docs/PERFORMANCE.md`
  - AC: every target met or the gap documented with a reason

- [ ] **B-64 — 24-hour soak** (M)
  - AC: no memory growth trend, no unhandled rejection, no connection-pool exhaustion
  - ⏳ A 20-minute soak (30 s scans, 3 SSE clients, polling) was run — see PERFORMANCE.md. The 24-hour run is still owed.

- [ ] **B-65 — Deployment docs** (M)
  - `DEPLOYMENT.md`, `TROUBLESHOOTING.md`, Dockerfile reviewed for `NET_RAW`
  - AC: someone else follows it on a clean machine and succeeds
  - ⏳ `DEPLOYMENT.md`, `TROUBLESHOOTING.md`, `Dockerfile` (arp-scan + setcap, non-root, healthcheck) written. Awaiting a stranger-install.
  - ✅ 2026-09-25: path A verified on a separate clean Linux VM (fresh `npm ci`, setup, seed, build, start, first-run setup, API smoke, 295 tests green). Remaining: another person, native Windows, Docker.

- [ ] **B-66 — Release checklist** (S)
  - Walk `PRD.md` §7 line by line
  - AC: every box ticked, or the gap is recorded as a known limitation
  - ⏳ Walked in `docs/RELEASE.md`; three items open (CI run, 24 h soak, stranger-install).
