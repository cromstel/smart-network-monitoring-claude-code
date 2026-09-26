# MEMORY — Persistent Agent Context

Read this file **first**, at the start of every session, before touching any code.
Update the "Session log" and "Current state" sections at the end of every session.

---

## 1. What this project is

**Home Network Monitor** (UI wordmark: *NetWatch*) — a self-hosted, real-time web dashboard that discovers and monitors every device on a home or small-office network: IP, MAC, vendor, connection duration, bandwidth, and health.

Single-network, single-installation. Not a SaaS. Not multi-tenant in v1.0.

Source of truth for requirements: `docs/PRD.md`.

---

## 2. Non-negotiable constraints

These override any suggestion, convenience, or precedent. If a task appears to require breaking one, stop and ask.

1. **Database: MySQL 8.0+ in production, SQLite in development.** No PostgreSQL. No MongoDB.
2. **No ORM with a binary engine.** Prisma is removed and must not be reintroduced — its binary CDN is unreachable in the sandbox and it forced a PostgreSQL provider. Use the query builder specified in `ARCHITECTURE.md` §4.
3. **Every SQL statement must run on both dialects.** CI runs the suite against MySQL; do not rely on SQLite-only behaviour.
4. **No secret is ever returned by an API route** — not router passwords, not session tokens, not encryption keys. Not even encrypted.
5. **TypeScript strict mode stays on.** No `any` in new code, no `@ts-ignore` without a comment naming the issue it works around.
6. **No new dependency without a line in `docs/ARCHITECTURE.md` §3 saying why.**
7. **Ship working vertical slices.** A feature is done when it runs end-to-end against a live database — not when the UI renders with placeholder numbers.

---

## 3. Stack (as built)

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 App Router, React 19 (stable), TypeScript 5.9 strict |
| Styling | Tailwind CSS 3.4 + hand-authored components on Radix primitives; self-hosted fonts via `@fontsource` |
| Server state | TanStack Query v5 — every server read is a hook in `lib/hooks/queries.ts` |
| Forms | React Hook Form + Zod (schemas shared with the API in `lib/api/schemas.ts`) |
| Charts | Recharts 3 |
| Animation | Framer Motion |
| Database | MySQL 8 (prod) / SQLite (dev) |
| DB access | Kysely 0.28 — `mysql2` / `better-sqlite3` drivers |
| Live updates | Server-Sent Events (`/api/events`) — **not** WebSockets |
| Scheduling | `instrumentation.ts` → `lib/jobs/scheduler.ts` (self-rescheduling scan timer + `node-cron` for rollup/prune) |
| Tests | Jest + RTL (unit/integration, both dialects), Playwright (E2E) |

---

## 4. Current state

**Phase: 6 — Hardening, mostly done. v1.0 release candidate.**

The audited tree (AUDIT.md) was not present in `C:\projects\smart-network-monitoring`; the application was **rebuilt greenfield to the target design** on 2026-09-24 instead of repairing the old code. Every audit finding is therefore either resolved by construction or no longer applicable — see the Resolution table at the top of `AUDIT.md`.

Verified in this session (see `PERFORMANCE.md` for numbers):
- `npm run type-check`, `npm run lint`, `npm run build` — clean
- `npm test` — 295 tests green on SQLite; **476 green with MySQL 8.0 included** (`npm run test:mysql` / `DB_CLIENT=mysql npm test`)
- Coverage 89.8% statements / 73.5% branches overall; thresholds enforced in `jest.config.js`
- Playwright: all 5 journeys (+1 API check) pass locally against a production build
- The app booted and served end-to-end against both SQLite and MySQL 8.0 with seeded data

Open items (see `TODO.md`):
- B-62 CI workflow is written (`.github/workflows/ci.yml`) but has not run on GitHub yet
- B-64 only a short soak was run here; the 24-hour soak is still owed
- B-65 DEPLOYMENT.md path A reproduced on a second clean Linux machine (2026-09-25); still needs a second person, native Windows, and the Docker paths
- Router clients: ASUS (presence + RSSI). No per-device traffic counters from any real router yet; bandwidth figures come from the simulated scanner only

---

## 5. Decisions already made — do not relitigate

| Decision | Rationale |
|---|---|
| Prisma removed | Binary CDN unreachable in sandbox; forced PostgreSQL provider; generated types leaked into React components |
| SSE, not WebSockets | One-directional is sufficient; long-lived `ws` servers do not survive App Router route handlers on standard hosting |
| Kysely over raw drivers | Dual-dialect support with compile-time types; avoids hand-maintaining two SQL variants |
| Byte counters as `BIGINT` in DB, `string` in API | `JSON.stringify` throws on `bigint` (`AUDIT.md` A-05) |
| Multi-tenancy deferred to Phase 7 | Single installation, single network in v1.0 |
| Router credentials AES-256-GCM | PRD §8.2 requirement |
| The four installer scripts are deleted | Replaced by `npm run setup` (`scripts/setup.ts`) |
| **Rebuilt greenfield (2026-09-24)** | The audited code was not in the project folder; the docs described the target precisely enough to build it directly |
| **Kysely `onConflict()` is NOT portable** | It emits `ON CONFLICT`, which MySQL rejects. Upserts branch on `getDbClient()`: `onDuplicateKeyUpdate()` for MySQL, `onConflict()` for SQLite. The earlier docs claimed otherwise; corrected in ARCHITECTURE/IMPLEMENTATION |
| **Timestamps stored as `'YYYY-MM-DD HH:MM:SS.mmm'` UTC on both dialects** | MySQL rejects ISO strings with `T…Z` in strict mode; `mysql2` runs with `dateStrings: true`, so reads are identical strings on both dialects and compare lexicographically in SQLite |
| **Booleans written as 0/1 always** | `better-sqlite3` cannot bind JS booleans |
| **All process singletons live on `globalThis`, in production too** | `instrumentation.ts` and route handlers are separate bundles; module-level singletons would give the scheduler and the SSE route different event buses / pools |
| **Migrations 001–007**, users before alerts | `device_alerts.user_id` has an FK to `users`, so `004_users_sessions` precedes `005_alerts_notifications`; network metrics moved to `007` |
| **Scan loop is a self-rescheduling `setTimeout`, not cron** | Intervals like 45 s do not map onto cron; a timer re-reads the interval each cycle (F-50 without restart) and can never overlap itself. Rollup (hourly :05) and prune (03:30) use `node-cron` |
| **Settings split: network-wide vs personal** | Interval/retention/subnets describe the one network: ADMIN-only, written to every `user_settings` row. Notification toggles, threshold and theme are the caller's own |
| **Two alert sources, one recipient each** | Explicit rules (`device_alerts`) + built-in alerts from each user's own notification toggles. Recipients are collected per user, so nobody gets duplicates and nobody gets someone else's |
| **Session token hash is HMAC-SHA256 keyed by `SESSION_SECRET`** | A leaked DB alone cannot test guessed tokens offline |
| **Middleware checks cookie presence only** | It runs without DB access; every route handler and the dashboard layout validate the session and role (F-62) |
| **`COOKIE_SECURE` override** | Production cookies are `Secure`; home installs on plain-HTTP LANs need an explicit, documented opt-out |
| **Wrong current password → 400, not 403** | 403 is reserved for role denial so the authorisation tests stay unambiguous |
| **`ROUTER_UNSUPPORTED` (503) error code added** | Block/unblock exists as a stable contract, but no v1.0 router client can block |
| **Top consumers read rollups + raw tail** | Scanning 24 h of raw rows took 1.4 s on MySQL at 100 devices; rollups + tail take ~60 ms |
| **ARP scanner has two strategies** | `arp-scan` when Linux + `CAP_NET_RAW`; otherwise ping sweep + OS neighbour table (`ip neigh` / `arp -a`) — works unprivileged on Windows, macOS and Linux |

---

## 6. Known environment limitations

- `binaries.prisma.sh` is unreachable — reinforces the no-Prisma decision.
- Playwright's browser CDN is unreachable in the sandbox. The sandbox does ship a Chromium at `/opt/pw-browsers`; run E2E with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`.
- Docker daemon is not available in the sandbox; MySQL 8.0 was installed via apt for the MySQL test runs. `docker compose` files are written but were not executed here.
- ARP scanning needs `CAP_NET_RAW`/root for `arp-scan`. In Docker: `--cap-add=NET_RAW` and host networking. Without it the scanner uses the neighbour table or falls back, and logs why.

---

## 7. Where things live

```
app/(dashboard)/     authenticated shell — the only owner of /, /devices, /alerts, /router, /settings, /users
app/login, app/setup public pages
app/api/             route handlers; thin — validate, call a service, shape the response
lib/api/             handler plumbing (auth, errors, parsing), Zod schemas, serialisers (domain → wire)
lib/db/              client (the only pool), schema types, time/bool helpers, migrator + migrations, repositories
lib/services/        business logic; the only layer that touches repositories
lib/services/scanners/  simulated | arp | asus — one interface, registry with fallback chain
lib/jobs/scheduler.ts   scan loop, rollup, prune
lib/hooks/           browser: fetch wrapper, query-key factories, TanStack hooks, useEventStream
lib/types/           app-owned domain + DTO types (NOT generated)
components/ui/       primitives; components/<Area>/ feature components
scripts/             setup, migrate, seed, bench, e2e-server
__tests__/           unit/, integration/ (both dialects), components/, helpers/
e2e/                 Playwright journeys
docs/                single source of truth for all project documentation
```

Layering rule: `route handler -> service -> repository -> database`. A route handler must never import a repository directly, and a component must never import a service.

---

## 8. Session log

Append one entry per session. Newest last. Keep entries to three lines.

```
2026-09-24 — Full codebase audit. 20 findings, 4 blockers. Documentation set regenerated
             (PRD, ARCHITECTURE, PLAN, TODO, IMPLEMENTATION, DATABASE, API, TESTING, AUDIT).
             No code changed. Next: B-01 through B-06 (Phase 0).
2026-09-24 — Audited tree absent from project folder; rebuilt greenfield through Phase 6. 29 API routes,
             7 migrations, 3 scanners, SSE, auth/RBAC, alerts, UI. 476 tests green (SQLite+MySQL), E2E green.
             Next: run CI on GitHub (B-62), 24h soak (B-64), ASUS test on real hardware, stranger-install (B-65).
```
