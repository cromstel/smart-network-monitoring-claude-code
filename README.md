# Smart Network Monitor

A self-hosted dashboard that answers one question: **what is connected to my network right now, what is it using, and should it be here?**

It discovers every device on your LAN, identifies the vendor from the MAC address (offline), tracks connection history and bandwidth, and alerts you — and only you — when an unknown device joins, a named device drops off, or something exceeds your bandwidth threshold. Nothing leaves your network.

- **Next.js 15 · React 19 · TypeScript (strict)** — App Router, Server-Sent Events for live updates
- **MySQL 8 in production, SQLite in development** — one typed query layer (Kysely) for both, tested on both
- **Three scanners with automatic fallback** — ASUS router API → ARP (`arp-scan` or the OS neighbour table) → simulated network
- **Accounts and roles** — ADMIN / MEMBER / VIEWER, enforced in every API route; router credentials encrypted with AES-256-GCM

## Quick start (development, simulated network)

```bash
npm ci
npm run setup        # creates .env with fresh secrets and migrates a local SQLite database
npm run db:seed      # optional: 12 simulated devices with 7 days of history
npm run dev          # http://localhost:3000 → /setup creates the first admin
```

To monitor your real network, set `SCANNER_MODE=arp` (or configure an ASUS router on the Router page) and `NETWORK_SUBNET` in `.env`. Production installs, Docker, HTTPS and MySQL are covered in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Commands

| | |
|---|---|
| `npm run dev` / `npm run build && npm start` | Run in development / production |
| `npm run type-check` · `npm run lint` | Static checks |
| `npm test` | Unit, integration (SQLite) and component tests |
| `npm run test:mysql` | Integration suites against MySQL too (`docker compose up -d mysql` first) |
| `npm run test:coverage` | With enforced coverage thresholds |
| `npm run test:e2e` | Playwright journeys against a production build |
| `npm run db:migrate` · `npm run db:seed` | Schema and demo data |
| `npm run bench` | Performance numbers on a scratch database |

## Documentation

Everything lives in [`docs/`](docs/README.md): requirements (PRD), architecture, database, API reference, testing strategy, deployment, troubleshooting, performance, and the release checklist. Contributors — human or agent — start with [`docs/MEMORY.md`](docs/MEMORY.md).

## Project layout

```
app/            pages (dashboard shell, login, setup) and API route handlers
components/     UI primitives and feature components
lib/            config, db (client, migrations, repositories), services, scanners, jobs, hooks, types
scripts/        setup, migrate, seed, bench, e2e server
__tests__/      unit, integration (both dialects), component tests
e2e/            Playwright journeys
docs/           single source of truth
```
