# Deployment

From a clean machine to a working dashboard. Three supported paths — pick one.

| Path | Database | Real device discovery | Best for |
|---|---|---|---|
| A. Node directly | SQLite or MySQL | ARP (neighbour table everywhere; `arp-scan` on Linux with `CAP_NET_RAW`) or ASUS router | Windows / macOS / Linux desktops, Raspberry Pi |
| B. Docker Compose | MySQL 8 (container) | ASUS router, or ARP with host networking | Always-on home server / NAS |
| C. Docker, host network | MySQL 8 | Full `arp-scan` sweep | Linux hosts where you want the most complete discovery |

Requirements: Node.js **20.9+** (22 LTS recommended) for path A; Docker 24+ with Compose v2 for B/C.

> **Authentication is always on.** The first visit to a fresh install goes to `/setup`, which creates the initial admin and then closes itself. Until that account exists, anyone who can reach the port can claim it — do the setup immediately after first start.

---

## A. Node directly

```bash
git clone <your repo> smart-network-monitoring && cd smart-network-monitoring
npm ci
npm run setup -- --subnet 192.168.1.0/24 --scanner arp   # writes .env with fresh secrets, migrates SQLite
npm run build
npm start                                                  # http://localhost:3000
```

Open `http://<this machine>:3000` → you are sent to `/setup` → create the admin → dashboard.

`npm run setup` flags (all optional):

| Flag | Effect |
|---|---|
| `--mysql` | sets `DB_CLIENT=mysql` and generates `MYSQL_ROOT_PASSWORD` for docker compose; fill `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` in `.env`, then `npm run db:migrate` |
| `--subnet <cidr>` | the network to scan, e.g. `192.168.0.0/24` |
| `--scanner simulated\|arp\|asus` | preferred scanner; it still falls back automatically (see below) |

It never overwrites an existing `SESSION_SECRET` or `ENCRYPTION_KEY`. **Back up `ENCRYPTION_KEY`** — without it the stored router password cannot be decrypted and must be re-entered.

Want demo data first? `npm run db:seed` loads a simulated 12-device network with 7 days of history (it refuses to run on a database that already has devices unless you pass `-- --reset`).

### Running it as a service

*Linux (systemd)* — `/etc/systemd/system/netwatch.service`:

```ini
[Unit]
Description=Smart Network Monitor
After=network-online.target

[Service]
WorkingDirectory=/opt/smart-network-monitoring
ExecStart=/usr/bin/npm start
Restart=on-failure
User=netwatch
# Optional: let the ARP scanner use raw sockets without root
AmbientCapabilities=CAP_NET_RAW

[Install]
WantedBy=multi-user.target
```

*Windows* — use Task Scheduler ("At startup", run `npm start` in the project folder) or a service wrapper such as NSSM. On Windows the ARP scanner uses a ping sweep plus `arp -a`; no extra software is needed.

---

## B. Docker Compose (app + MySQL)

```bash
npm run setup -- --mysql           # or copy .env.example to .env and fill SESSION_SECRET / ENCRYPTION_KEY
# edit .env: DB_PASSWORD=<choose one>, SCANNER_MODE=asus (if you have an ASUS router) or arp
docker compose --profile app up -d --build
docker compose logs -f app         # watch for "scheduler started" and "scanner selected"
```

Every value docker compose needs comes from `.env` — it refuses to start with a
message naming the missing variable (`DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`DB_PORT`, `DB_TEST_NAME`, `MYSQL_ROOT_PASSWORD`, `PORT`). `npm run setup
-- --mysql` generates `MYSQL_ROOT_PASSWORD` for you; the rest ship as
placeholders in `.env.example` that you replace.

Open `http://<host>:3000/setup`.

Inside a bridged container, ARP only sees the Docker network, so the scanner falls back (logged once, with the reason). Use the router integration (Router page → ASUS) or path C for real discovery.

The `mysql` service also creates the scratch database named by `DB_TEST_NAME` for `npm run test:mysql`. Data lives in the `mysql-data` volume.

## C. Docker with host networking (full ARP sweep, Linux only)

In `docker-compose.yml`, on the `app` service: remove `ports`, add `network_mode: host` and `cap_add: [NET_RAW]`, and set `DB_HOST=127.0.0.1` (MySQL's port is published on localhost). The image ships `arp-scan`, `iproute2` and `ping`; with `CAP_NET_RAW` the scanner probes, finds the capability, and uses `arp-scan`.

---

## Configuration reference

All variables are validated at startup (`lib/config.ts`). A missing or malformed one stops the server with a message naming it.

| Variable | Default | Notes |
|---|---|---|
| `DB_CLIENT` | `sqlite` | `mysql` for production |
| `DB_FILE` | `./data/dev.db` | SQLite only |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | — | Required when `DB_CLIENT=mysql`; no fallback, the server refuses to guess |
| `SESSION_SECRET` | — | ≥ 32 chars. Keys the session-token hash |
| `ENCRYPTION_KEY` | — | 64 hex chars. AES-256-GCM key for router credentials |
| `NETWORK_SUBNET` | `192.168.1.0/24` | Initial value; editable later in Settings (admin) |
| `SCANNER_MODE` | `simulated` | `simulated` · `arp` · `asus` |
| `SCAN_INTERVAL_SECONDS` | `30` | 30–3600. Initial value; editable in Settings without restart |
| `AUTO_MIGRATE` | `true` | Apply pending migrations at startup |
| `SCHEDULER_ENABLED` | `true` | Set `false` on a second replica so only one process scans |
| `COOKIE_SECURE` | `true` in production | Set `false` **only** for plain-HTTP access on a trusted LAN |
| `LOG_LEVEL` | `info` | pino levels; secrets are redacted |
| `PORT` | `3000` (Next.js) | Validated when set; the server reads the env var directly |

### HTTPS

Production cookies are `Secure`, so browsers only send them over HTTPS. Either put a reverse proxy in front (Caddy, nginx, Traefik — terminate TLS there and proxy to port 3000; keep `proxy_buffering off` for `/api/events`), or, on a trusted home LAN with plain HTTP, set `COOKIE_SECURE=false`.

Minimal Caddyfile:

```
netwatch.home.arpa {
  reverse_proxy 127.0.0.1:3000 {
    flush_interval -1
  }
}
```

### Scanner selection

At startup, and again after any scan failure or router change:

`SCANNER_MODE` → `asus` (router configured and login works) → `arp` (capability probe passes) → `simulated`.

Each fallback is logged at `warn` with what failed and what was chosen. Bandwidth figures need a scanner that can see traffic: the simulated network does; ARP and the ASUS client-list API report presence only, and the dashboard says so instead of inventing numbers.

---

## Upgrading

```bash
git pull && npm ci && npm run build && (restart the service)
```

Migrations run automatically (`AUTO_MIGRATE=true`). To run them by hand: `npm run db:migrate`. Take a database backup first (`mysqldump smart_home_monitor > backup.sql`, or copy `data/dev.db` with the server stopped).

## Backups

What matters: the database and `.env` (specifically `ENCRYPTION_KEY`). Raw bandwidth samples are pruned after `dataRetentionDays` (default 30); hourly rollups are kept for the same window.

## Health checks

`GET /api/health` is public: `200 {"status":"ok",...}` when the database answers, `503 "degraded"` when it does not. The Docker image's `HEALTHCHECK` uses it.
