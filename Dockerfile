# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js standalone server.
#   docker compose up -d        (app + MySQL, see docker-compose.yml)
#
# ARP discovery needs raw sockets: run with `network_mode: host` and `cap_add: [NET_RAW]`
# (Linux hosts). Without them the scanner detects the missing capability at startup and falls
# back to the router API or the simulated network, logging which one it chose.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# arp-scan + iproute2 + ping give the ARP scanner its tools; libcap lets node hold CAP_NET_RAW as non-root.
RUN apt-get update && apt-get install -y --no-install-recommends arp-scan iproute2 iputils-ping libcap2-bin curl \
  && rm -rf /var/lib/apt/lists/* \
  && setcap cap_net_raw+eip /usr/sbin/arp-scan || true
RUN groupadd --system app && useradd --system --gid app --home /app app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
