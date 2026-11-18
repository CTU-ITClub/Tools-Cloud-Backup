FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Worker JS is loaded by Node worker_threads, not statically traced by Next.
COPY --from=builder /app/lib/native ./lib/native
# The worker dynamically requires Koffi; Next standalone file tracing cannot discover it.
COPY --from=builder /app/node_modules/koffi ./node_modules/koffi
COPY --from=builder /app/tdlib-native ./tdlib-native
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-bookworm-slim AS backup
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tar libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/backup-daemon.cjs scripts/private-settings.cjs ./scripts/
RUN mkdir /app/data && chown -R node:node /app/data
USER node
CMD ["node", "scripts/backup-daemon.cjs"]
