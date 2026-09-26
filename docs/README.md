# Documentation

Home Network Monitor — a self-hosted dashboard that discovers and monitors every device on a local network.

These documents are the single source of truth. Any `.txt` status file or installer script in the repository root predates them and should be deleted (`AUDIT.md` A-19, A-20).

---

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | **[MEMORY.md](MEMORY.md)** | Where the project stands, what is decided, what must never be broken. **Read first, every session.** |
| 2 | **[AUDIT.md](AUDIT.md)** | The 20 findings against the old tree, and how each was resolved. |
| 3 | **[PRD.md](PRD.md)** | What we are building and how we know it is finished. |
| 4 | **[ARCHITECTURE.md](ARCHITECTURE.md)** | How the system is put together and why. |
| 5 | **[PLAN.md](PLAN.md)** | Seven phases, each with a definition of done. |
| 6 | **[TODO.md](TODO.md)** | The ordered backlog. Work top to bottom. |
| 7 | **[IMPLEMENTATION.md](IMPLEMENTATION.md)** | Conventions, patterns, code examples, definition of done. |
| 8 | **[DATABASE.md](DATABASE.md)** | Schema, indexes, dialect differences, retention. |
| 9 | **[API.md](API.md)** | Every endpoint, payload, and role requirement. |
| 10 | **[TESTING.md](TESTING.md)** | What to test, at which layer, and the tests that must exist. |
| 11 | **[DEPLOYMENT.md](DEPLOYMENT.md)** | From a clean machine to a working dashboard: Node, Docker, host networking. |
| 12 | **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Symptom → cause → fix. |
| 13 | **[PERFORMANCE.md](PERFORMANCE.md)** | Measured numbers against the PRD §5 targets, and the soak run. |
| 14 | **[RELEASE.md](RELEASE.md)** | PRD §7 release criteria, walked line by line. |

---

## Current state, in one paragraph

The old tree the audit describes was not in the project folder, so on 2026-09-24 the application was rebuilt greenfield to the target design in these documents: Next.js 15 + Kysely on MySQL/SQLite, three scanners with a fallback chain, sessions and RBAC enforced per route, owner-scoped alerts, SSE live updates, and a full dashboard. Type-check, lint and build are clean; the test suite is green on SQLite **and MySQL 8**; the five Playwright journeys pass. What remains before calling it v1.0 is in `RELEASE.md`: a CI run on GitHub, a 24-hour soak, and a second person following `DEPLOYMENT.md`.

## For an agent picking this up cold

```
1. Read MEMORY.md — especially §2 (constraints) and §4 (current state)
2. Read AUDIT.md — understand why the build fails before changing anything
3. Open TODO.md, take the top unticked task
4. Follow IMPLEMENTATION.md §1 for the working rhythm
5. Tick the task; if a decision changed, add a line to MEMORY.md §5
```

Do not batch tasks. One task, verified, then the next.

---

## The three things most likely to go wrong

**Reintroducing Prisma or PostgreSQL.** They are removed deliberately: the Prisma binary CDN is unreachable in this environment, and the generated types had leaked into React components. `MEMORY.md` §2.

**Cross-user alert leakage.** Every alert and notification query must filter by owner. A version of this bug has shipped before on a related project — one user's bandwidth threshold fired notifications for everyone. The negative test gets written before the feature (`TODO.md` B-51).

**SQLite/MySQL dialect drift.** Development on SQLite and production on MySQL means bugs that only appear after deploy. `ARCHITECTURE.md` §4 lists the specific divergences; CI runs the integration suite against real MySQL for this reason. If the team would rather not carry that risk, running MySQL in Docker for development removes it entirely.

---

## Quick reference

```bash
npm run dev            # SQLite, simulated scanner
npm run build
npm run type-check
npm test
npm run test:mysql     # integration suite against MySQL in Docker
npm run test:e2e
npm run db:migrate
npm run db:seed        # 12 devices, 7 days of history
npm run setup          # create .env with secrets, migrate
npm run bench          # performance numbers (scratch DB)

docker compose up -d mysql          # MySQL 8 for parity testing
docker compose --profile app up -d  # app + MySQL
```

Configuration: copy `.env.example` to `.env`. Every variable is documented in `ARCHITECTURE.md` §7 and validated at startup — a missing one fails immediately with a message naming it.
