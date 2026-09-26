# Performance

Measured 2026-09-24 in the development sandbox (2 vCPU, 8 GB RAM, Node 22, SQLite via better-sqlite3, MySQL 8.0.46 local). Reproduce with `npm run bench` and `npm run bench -- mysql` (scratch database, never real data).

## Against the PRD §5 targets

| Target | Result | Status |
|---|---|---|
| History queries over 30 days < 1 s | 13–21 ms per device, 52–268 ms network-wide, at 100 devices | ✅ |
| 100 concurrent devices, no visible degradation | Device list 23–37 ms; sorted by live bandwidth 25–97 ms | ✅ |
| Full /24 scan < 30 s | Simulated: 24–60 ms per cycle. ARP neighbour-table strategy: 254 pings at 64 in flight, ~4–5 s worst case (1 s timeout per ping). `arp-scan`: typically 2–4 s. Not measured on a physical LAN here | ✅ by design, ⏳ measure on real hardware |
| Dashboard FCP < 2 s warm | First-load JS 102 kB shared, 107–320 kB per page; server-rendered shell; data streamed by TanStack Query. Not measured with Lighthouse | ⏳ measure |

## Benchmark: 100 devices, 30 days hourly (72 000 rows) + 24 hours raw at 30 s (288 000 rows)

| Operation | SQLite | MySQL 8.0 |
|---|---:|---:|
| Device 30-day history (hourly) | 8 ms | 13 ms |
| Device 24-hour history (raw, downsampled to ≤ 360 points) | 12 ms | 28 ms |
| Network 30-day history (hourly) | 52 ms | 268 ms |
| Top consumers, 24 h | 61 ms | 60 ms |
| Top consumers, 30 d | 67 ms | 235 ms |
| Device list, page of 50 | 37 ms | 23 ms |
| Device list sorted by live bandwidth | 97 ms | 25 ms |
| Hourly rollup, first run over 24 h × 100 devices | 2.1 s | 8.0 s |
| Hourly rollup, re-run (idempotent) | 167 ms | 632 ms |
| Retention prune, nothing expired | 28 ms | 92 ms |

The rollup is a background job (hourly at :05); in steady state it processes two hours, not twenty-four. Its first-run cost on MySQL is dominated by one upsert per device-hour; batching the upserts is the obvious improvement if it ever matters.

### A fix this measurement drove

**Top consumers over 24 h took 1 364 ms on MySQL** at this scale — `MAX(total) − MIN(total)` grouped over 288 000 raw rows. It now reads completed hours from `bandwidth_hourly` and only the tail since the last rollup from raw samples: **60 ms**. Covered by `bandwidthQueries.test.ts` ("combines rolled-up hours with the raw tail").

## Endpoint timings on the seeded demo network (MySQL, 12 devices, production build)

| Request | Time |
|---|---:|
| `GET /api/bandwidth/history?range=30d` | 32 ms |
| `GET /api/bandwidth/history?range=24h` | 50 ms |
| `GET /api/devices/{id}/bandwidth?range=30d` | 44 ms |
| `GET /api/devices/{id}` | 27 ms |
| `GET /api/devices?pageSize=100&sort=bandwidth` | 17 ms |
| `POST /api/devices/scan` (full cycle) | 81 ms |

## Soak (B-64) — short run

20 minutes against a production build: SQLite, simulated scanner every 30 s, three open SSE clients, the device list and 24 h history polled every 30 s.

| Minute | 0 | 1 | 5 | 10 | 15 | 20 |
|---|---:|---:|---:|---:|---:|---:|
| RSS (MB) | 304.9 | 281.0 | 283.5 | 284.5 | 285.6 | 286.7 |

- `/api/health` 200 on every probe; no `error`/`fatal` log lines; no unhandled rejections.
- RSS settles after start-up, then drifts up ~0.3 MB/min (281.0 → 286.7 MB over 19 minutes). Twenty minutes cannot tell V8 heap growth toward a steady state from a slow leak. The bounded structures (`globalThis` counter map keyed by MAC, rate-limit windows swept every 10 min, one listener per SSE client, removed on disconnect and verified by `eventBus.test.ts`) give no obvious candidate. **The 24-hour soak remains open** — run it with `--inspect` heap snapshots at 1 h and 24 h if the drift continues.
