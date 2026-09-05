# Dependencies first, so a code change does not reinstall them.
FROM oven/bun:1.3.14-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN useradd --uid 10001 --create-home nash && chown -R nash:nash /app
USER nash

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD bun --eval "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? 10000) + '/health'); process.exit(r.ok ? 0 : 1)"

# Seeding runs on every boot and is idempotent: seeded rows are inserted once
# and never overwritten, so a restart cannot revert a staff edit or put a
# withdrawn offer back on the site. A seeding failure is logged and must not
# stop the server from serving.
CMD ["sh", "-c", "bun scripts/seed.ts || echo 'seed failed, serving anyway' >&2; exec bun src/server.ts"]
