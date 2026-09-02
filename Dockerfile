FROM oven/bun:1.3.14-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN useradd --uid 10001 --create-home marchmont && chown -R marchmont:marchmont /app
USER marchmont
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD bun --eval "const r = await fetch('http://127.0.0.1:3000/health'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "src/server.ts"]
