# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Prisma's query-engine selection needs the `openssl` CLI to detect the
# libssl version on this image; without it, it silently guesses wrong
# (openssl-1.1.x) and the engine binary fails to load at runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Full node_modules (not pruned) so the Prisma query engine binary and the
# TypeScript-emitted Prisma client (bundled at build time, but re-resolved
# at runtime for `prisma migrate deploy`) are both present.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Only /app/data needs to be writable by the runtime user (the SQLite file
# lives there); everything else just needs to stay world-readable, which
# COPY already leaves it as — avoid a recursive chown over node_modules,
# it's tens of thousands of files and needlessly slow.
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown nextjs:nodejs /app/data

USER nextjs

ENV DATABASE_URL="file:/app/data/prod.db"
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
