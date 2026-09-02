# Marchmont

A private property house. Houses and offices, for sale, on long lease, or on a
corporate mid-term let.

- Spec: `docs/superpowers/specs/2026-09-02-marchmont-design.md`
- Working rules and standards: `BRIEF.md`
- Brand: `docs/brand/marchmont-identity.md`

## Run it

```bash
cp .env.example .env
docker run -d --name marchmont-mongo -p 27017:27017 mongo:8
bun install
bun run seed
bun run dev
```

The site is on http://127.0.0.1:3000.

## Test it

```bash
bun test
```

Tests need a MongoDB on `MONGO_URL`, defaulting to `mongodb://127.0.0.1:27017`.
Each suite creates and drops its own database.

## Container

```bash
./scripts/verify-container.sh
```

Builds the image, brings up MongoDB beside it, and waits for `/health` to report
ready. Compose maps MongoDB to host port 27018 so it does not collide with a
local instance on 27017.

## Deploy

A container on a host with a long-running process: Fly.io, Render, Railway or a
VPS. Not Vercel, which runs Node rather than Bun and kills background intervals.
MongoDB runs as a managed instance rather than in the app container.

Required environment: `NODE_ENV`, `PORT`, `MONGO_URL`, `MONGO_DB`,
`SESSION_SECRET`, `PAYMENTS_PROVIDER`, `GEOCODING_PROVIDER`, `MAIL_PROVIDER`.
Production refuses to boot if any provider is `sandbox`.

`bun run seed` is safe to run on every boot and rebuilds a working demo, so a
host without a persistent disk is never left with an empty site.

## Photography

Demo photography is served from the Unsplash CDN, which is the single external
origin the content security policy admits, and only for `img-src`. Every URL is
built in `src/providers/images.ts`; that module is the only thing that changes
when real photography of real buildings replaces it, and the policy tightens
back to `'self'` at the same time. A deterministic sandbox provider serving
`/images/` is in the same file for offline use.

The seed portfolio is fictional and the photographs are stock. Neither is a
representation about a real building.

## Money

Prices are `bigint` minor units plus an ISO 4217 code, stored as BSON `Long`.
The client sets `promoteLongs: false`; without it the driver returns any int64
that fits in a double as a plain number, and every realistic price would arrive
float-backed while only amounts above 2^53 stayed correct.

## Audit log hardening

The audit log is append-only through three mechanisms: the repository exposes
only `append`, a collection validator rejects malformed entries, and a test in
`tests/guards/` fails on any source that mutates the collection.

For production, add a database role granting only `insert` and `find` on
`audit`, and connect the application with it. That moves the last of the
guarantee out of application code and into the database.
