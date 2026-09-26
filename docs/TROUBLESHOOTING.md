# Troubleshooting

Logs are structured JSON (pino). With `npm start`, they go to stdout; with Docker, `docker compose logs -f app`. Search by the `msg` field quoted below.

---

### The server exits immediately: `Invalid environment configuration`

A variable is missing or malformed; the message names it, e.g. `ENCRYPTION_KEY: must be 64 hex characters`. Run `npm run setup` to generate secrets, or fix `.env` by hand. See `DEPLOYMENT.md` → Configuration reference.

### I can't sign in — the login form just reloads (production, plain HTTP)

Production cookies are `Secure` and browsers drop them over `http://`. Use HTTPS via a reverse proxy, or on a trusted LAN set `COOKIE_SECURE=false` and restart.

### `Too many requests` on login

Five failed attempts per 15 minutes per IP. Wait for the `Retry-After` period, or restart the server (limits are in memory). Behind a proxy, make sure it sets `X-Forwarded-For`, otherwise every client shares the proxy's IP.

### I forgot the only admin password

With the server stopped, open a database shell and delete the users (sessions and settings cascade), then visit `/setup` again:

```sql
DELETE FROM users;
```

Devices and history are kept. Alert rules and notifications belonged to the deleted users and are removed with them.

---

### No devices appear / only simulated devices appear

Look for `scanner selected` and `preferred scanner unavailable; falling back` in the log. The `failed` array lists each scanner that was skipped and why:

| Reason | Fix |
|---|---|
| `no router is configured` | Configure it on the Router page, or use `SCANNER_MODE=arp` |
| `router rejected the credentials` / `router unreachable` | Router page → Test connection. ASUS only in v1.0 |
| `neither arp-scan (with CAP_NET_RAW) nor ip/arp is available` | Install `iproute2` (Linux) — Windows/macOS have `arp` built in |
| `arp-scan present but CAP_NET_RAW missing` (info) | Not an error: the neighbour-table strategy is used. For a full sweep: `sudo setcap cap_net_raw+eip $(which arp-scan)` or run with `AmbientCapabilities=CAP_NET_RAW` |

`SCANNER_MODE=simulated` always wins while it is set — it is the default for development. Change it in `.env` and restart.

In Docker with bridge networking, ARP only sees the container network. Use the router integration or host networking (DEPLOYMENT.md, path C).

### Devices are found but "Now" and charts show no bandwidth

ARP and the ASUS client list report presence, not traffic. Per-device throughput needs counters from the router; v1.0 ships them for the simulated network only. The device list shows `—` rather than a made-up number, and the Overview's "Top consumers" panel explains this when it is empty.

### A device shows "offline" although it's on

A device is marked offline after two missed scans, and never sooner than two minutes. Phones in deep sleep often stop answering ARP/ping; this is expected. If it happens to a wired device, check that it is inside `networkSubnet` and not in an ignored subnet (Settings → Network).

### A device keeps reappearing after I delete it

Deletion removes history; a device that is still on the network is rediscovered by the next scan. Use **Edit → Hide this device** to ignore it permanently.

### Duplicate devices for one phone

Modern phones use a private (randomised) MAC per network, and may rotate it. The vendor then reads `Private (randomised MAC)`. Turn off "private address" for your home network on the phone, or name the new entry and delete the old one.

---

### The dashboard says "reconnecting" in the top bar

The live-update stream (`/api/events`) dropped. The client retries with backoff (1 s → 30 s) and refetches everything when it reconnects. If it never connects behind a reverse proxy, disable response buffering for that path (nginx: `proxy_buffering off;`, Caddy: `flush_interval -1`).

### Charts for 7d / 30d are empty right after install

Long ranges read hourly rollups, written at five past each hour (and once at startup for anything missed). Wait for the next rollup, or seed demo data with `npm run db:seed`.

### Router page: "The router did not respond"

Check the IP and port (ASUS web UI is usually port 80; HTTPS-only UIs need 443 or 8443). The router password is stored encrypted; if `ENCRYPTION_KEY` changed since it was saved, the log shows `router credentials could not be decrypted` — re-enter the password.

### "Blocking devices is not supported"

Blocking (PRD F-44) is a P2 feature; no v1.0 router client can block. The endpoint exists so the API contract is stable.

---

### MySQL: `ER_NOT_SUPPORTED_AUTH_MODE` / `Access denied`

Use MySQL 8 with a user that has all privileges on `DB_NAME`. `mysql2` supports `caching_sha2_password`; if you use a proxy that does not, create the user `IDENTIFIED WITH mysql_native_password`.

### MySQL: `Too many connections` during development

Exactly one pool of 10 connections exists per process (`lib/db/client.ts`, cached on `globalThis`). If you see this, something else is opening connections — check for a second running dev server.

### SQLite: `database is locked`

Another process holds a write lock (e.g. a DB browser with an open transaction, or two servers on the same file). The client waits 5 s before failing. Close the other writer.

### Tests: `npm run test:mysql` cannot connect

Start MySQL with `docker compose up -d mysql` and pass `DB_HOST=127.0.0.1 DB_USER=monitor DB_PASSWORD=<.env value>`. The suite uses the `home_monitor_test` database created by `docker/mysql-init/01-test-db.sql` — never your real data.

### E2E: `Executable doesn't exist`

Run `npx playwright install chromium` once. In a sandbox without the Playwright CDN, point at an existing Chromium: `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`. The E2E server needs a prior `npm run build`.
