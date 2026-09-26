# Release checklist — v1.0

`PRD.md` §7, walked line by line on 2026-09-24 (TODO B-66). ✅ met and verified · ⏳ open, with what is missing.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npm run build` succeeds with zero errors | ✅ | Clean build, 29 API routes + 8 pages |
| 2 | `npm run type-check` succeeds with zero errors | ✅ | `tsc --noEmit` clean; strict mode, no `any`, no `@ts-ignore` |
| 3 | All P0 requirements implemented and covered by a test | ✅ | Table below |
| 4 | Test suite green against **MySQL**, not only SQLite | ✅ | 476 tests with MySQL 8.0 included (295 on SQLite alone) |
| 5 | Unit coverage ≥ 70 % on `lib/services/` and `lib/utils/` | ✅ | 89.8 % statements overall; `lib/utils` 100 % lines; enforced in `jest.config.js` |
| 6 | Playwright covers login, device list, rename, history, configure alert | ✅ locally · ⏳ CI | `e2e/01…05` pass against a production build; the GitHub workflow has not run yet |
| 7 | No plaintext credential anywhere in the database | ✅ | Router password AES-256-GCM in `password_encrypted`; user passwords bcrypt-12; session tokens HMAC-hashed. Asserted in `routes.test.ts` |
| 8 | Retention pruning verified to actually delete rows | ✅ | `maintenance.test.ts` on both dialects, batch loop exercised |
| 9 | 24-hour soak, no memory growth, no unhandled rejection | ⏳ | 20-minute soak clean (PERFORMANCE.md); 24 h run owed |
| 10 | `DEPLOYMENT.md` reproduces a working install from scratch | ⏳ | Path A reproduced on a second, clean Linux machine (2026-09-25): `npm ci` → `npm run setup` → `db:seed` → `build` → `start` → `/setup` → live dashboard, and 295 tests green there. Still owed: a second *person*, a native Windows run, and the Docker paths on a host with a Docker daemon |

## P0 requirements → tests

| ID | Requirement | Covered by |
|---|---|---|
| F-01 | Periodic subnet scan | `scan.test.ts` (cycle), scheduler in `lib/jobs/scheduler.ts` |
| F-02 | Three scanner backends | `scanners.test.ts`, `asusClient.test.ts`, `scan.test.ts` |
| F-04 | Offline OUI vendor | `scan.test.ts` asserts `Apple, Inc.` from the bundled registry |
| F-05 | New device within 30 s | Scan interval ≥ 30 s; the first scan runs at startup; `scan.test.ts` |
| F-06 | Offline after 2 missed scans (min 2 min) | `deviceService.test.ts`, `scan.test.ts` |
| F-07 | Degrade when privileges are missing | `scanners.test.ts` (CAP_NET_RAW probe, fallback order) |
| F-10 | Device fields displayed | E2E 02, `routes.test.ts` envelope |
| F-11 | Editable name/type, persisted | E2E 03, `routes.test.ts` |
| F-20 | Current throughput per device | `scan.test.ts` (counters → speed), `bandwidthQueries.test.ts` |
| F-21 | Cumulative bytes, survives counter resets | `scan.test.ts` |
| F-22 | 1h / 24h / 7d / 30d history | `bandwidthQueries.test.ts`, E2E 04 |
| F-24 | Top-N consumers | `bandwidthQueries.test.ts` |
| F-30 | Unknown device alert | `alertOwnership.test.ts`, `scan.test.ts` |
| F-33 | Activity log, acknowledgeable | `routes.test.ts` (notifications), E2E 05 |
| F-34 | Alerts scoped to their owner | `alertOwnership.test.ts` — the leak test |
| F-40 | Router credentials AES-256-GCM | `security.test.ts`, `routes.test.ts` |
| F-42 | Fall back to ARP without a router | `scanners.test.ts` fallback order |
| F-50 | Subnet and interval configurable (30 s–1 h) | `routes.test.ts` settings, `config.test.ts` |
| F-51 | Retention enforced by a job | `maintenance.test.ts` |
| F-60 | bcrypt ≥ 12 | `security.test.ts` |
| F-61 | httpOnly, sameSite=lax, secure in prod | `routes.test.ts` (setup cookie) |
| F-62 | Roles in middleware **and** every handler | `routes.test.ts` route × role matrix (32 routes × 3 roles, plus 401 for each) |
| F-63 | First-run setup | `routes.test.ts`, E2E 01 |

## Known limitations shipped in v1.0

- **Per-device bandwidth on real networks.** ARP and the ASUS client list report presence and signal, not traffic. Throughput and "top consumers" are populated by the simulated network; on a real network they stay empty and say why. A router integration that exposes per-client counters is the next step.
- **ASUS client** is tested against a faithful fake, not yet against real hardware.
- **Blocking** (F-44, P2) returns `503 ROUTER_UNSUPPORTED`.
- **Rate limits and the event bus are in-process.** One server process per installation (as designed); a multi-replica deployment would need a shared store and `SCHEDULER_ENABLED=false` on all but one.
- **Password reset by email** (F-64, P2) is not implemented; the admin can reset any user's password on the Users page.
