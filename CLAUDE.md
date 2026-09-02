# Marchmont

A private property house operating internationally. Holds its own stock of
houses and offices and offers each for sale, on long lease, or on a corporate
mid-term let. The website is the marketing channel and the point of sale.

**Read before working here:**
- Spec: `docs/superpowers/specs/2026-09-02-marchmont-design.md`
- Working rules, standards and traps: `BRIEF.md`

## Stack

Bun, Express 5, Pug, Alpine.js (CSP build), MongoDB, `bun:test`.

Chosen deliberately in the spec. **Use Express, not `Bun.serve()`**, and
server-rendered Pug rather than a client framework. Plain CSS in one stylesheet,
no Tailwind. Use `bun` for everything: `bun install`, `bun test`, `bun run`,
`bunx`. Never npm, yarn or pnpm.

## Rules that are not negotiable

- **No floating point for money, anywhere.** Every monetary value is
  `{ amount: Long, currency }` in minor units plus ISO 4217, read through the
  money helper so it arrives as `bigint`. `parseFloat`, `toFixed` and
  `Long.toNumber()` are banned on money paths. The driver returns int64 as
  `Long`, and converting to a JS number silently rounds above 2^53. Small test
  values never trip it.
- **Every price carries its own currency.** No single normalised amount. FX is
  indicative, timestamped, cached, and never blocks a render.
- **Area is an integer of hundredths of a square metre**, canonical, displayed
  per the viewer's locale. Never stored twice.
- **The audit log is append-only.** The audit repository exposes only `append`.
  No update or delete path exists, and a schema validator backs it.
- **No MongoDB driver access outside `src/db/repositories/`.**
- **`src/domain/` imports neither Express nor `mongodb`.** Pure logic over plain
  objects.
- **No payment path exists that does not begin at a staff-approved
  application.** Money only moves through a live, single-use, time-boxed payment
  window whose amount was fixed at approval time and is never client-supplied.
- **CSP carries no `unsafe-inline` and no `unsafe-eval`.** No inline `<style>`,
  no `style=` attributes, no inline `<script>`. Alpine components register via
  `Alpine.data()`.
- **A sandbox provider is valid in production.** Do not add a guard that
  refuses one; that constraint came from a regulated product and does not apply
  here.
- **Offer status is a state machine**, not a boolean. Transitions are explicit,
  validated in `src/domain/`, and audited.

## Conventions

- A property and an offer are different things. One building may carry a sale
  offer, a lease offer on some floors and a corporate let on another, each with
  its own price, currency, lifecycle and audit trail.
- Sale, long lease and corporate let have genuinely different fields. Do not
  collapse them into one shape with mostly-null columns.
- No hardcoded country, currency, locale, phone format or date format anywhere.
- UI copy is plain and direct. No marketing inflation, no em dashes.
- Git identity here is `timileyindev <timmypelumy@gmail.com>`, set locally.

## Compliance context

No investment advice and no representation about property value or yield.
Estate-agency registration and anti-money-laundering obligations apply in
several markets in scope; state status at its actual current stage and never
claim one we do not hold. Fair-housing style rules apply: no filter and no copy
may discriminate on a protected characteristic.
