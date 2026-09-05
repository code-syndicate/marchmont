# Nash Luxury Realty: design

Date: 2026-09-02
Status: approved

## 1. What this is

Nash Luxury Realty is a single property company operating internationally. It holds its
own stock of houses and offices and offers each of them for sale, on long lease,
or on a corporate mid-term let. The website is both the marketing channel that
brings buyers and tenants in and the place the transaction is opened and paid.

This is not a marketplace. There are no third-party agents or agencies, no
agency verification queue, and no agent portal. The only people who publish
listings are Nash Luxury Realty staff.

Money moves on the site, but only after a member of staff has approved the
person paying. Nothing about the payment path is open to an unreviewed visitor.
This is the defining constraint of the product and section 4 describes the
mechanism that enforces it.

### Out of scope at launch

- Short lets. No nightly or weekly rates, no availability calendar, no
  date-range search, no overlap locking. Adding these later is a new slice, not
  a retrofit of an existing one.
- Third-party agents.
- Escrow, or taking a full purchase price online. The site takes reservation
  fees, holding deposits and first payments. Completion happens offline.
- Investment advice, yield projections, or any representation about property
  value.

## 2. Brand

**Nash Luxury Realty.** A private property house. The posture is discreet rather than
promotional: few properties, shown by appointment, registrations reviewed before
viewing details are released.

The approval gate is the brand. On a volume portal, reviewing every registrant
would read as friction. Here it reads as house policy, and the interface should
present it that way without apologising for it.

### Visual direction

Derived from the Ferrous & Oak reference, taken darker and more serif-led.

- **Ground.** Near-black, warm rather than neutral. Surfaces are layered by
  lightness, not separated by borders. Hairline dividers where a division is
  genuinely needed.
- **Accent.** A single oxblood, used rarely enough that its appearance carries
  meaning. It marks the primary action and nothing else.
- **Type.** Fraunces for display, Bitter for the serif body voice, Inter for
  interface and data. Generous scale, real spacing rhythm from one unit
  variable.
- **Radius.** Zero, everywhere. Inherited from the reference and kept
  deliberately; the sharp corner is a large part of why the reference reads as
  considered.
- **Rows, not cards.** Flat rows with hairline dividers for every list. The one
  exception is the portfolio grid, where the photograph leads.
- **Photography is the product.** The gallery is a first-class component: lead
  image, thumbnail strip, keyboard navigation, lazy loading, and fixed aspect
  ratios that never reflow the page as images arrive.

The reference stylesheet is Tailwind output. Its token values, type pairing,
spacing rhythm and layout decisions carry over; the compiled utility classes do
not. The result is one hand-authored stylesheet, per the engineering rules.

### Voice

Understated and factual. Industry-standard property language: "guide price",
"service charge", "freehold", "available from 1 March", "3 bed semi-detached",
"1,240 m2 over two floors".

Sample: *"Registrations are reviewed before viewing details are released. We ask
for a little about your requirement."*

Never claim what is not true. No fabricated listing counts, no invented
testimonials, no "trusted by" without a nameable source. No AI voice, no em
dashes or en dashes in interface copy, no internal commentary rendered to the
page.

## 3. Domain model

MongoDB. Collections below; every one is written only through its repository.

### 3.1 Two primitives

**Money.** Every monetary value is `{ amount: Long, currency: string }`, where
`amount` is BSON int64 in minor units and `currency` is ISO 4217. Values are
read through a helper that returns `bigint`.

No JS `number` ever holds a price. `parseFloat`, `toFixed` and `Long.toNumber()`
are banned on any money path. The Mongo driver returns int64 as a `Long`, and
`Long.toNumber()` silently rounds above 2^53 exactly the way `bun:sqlite`'s
plain integer read does. Small test values never trip it, so a test passing is
not evidence of correctness here. A guard test greps for these calls.

Every price carries its own currency. There is no single normalised amount.
Display is in the offer's currency by default, with an optional converted figure
that is clearly marked indicative and timestamped. FX comes from a provider
behind an interface, cached, and never blocks a page render.

**Area.** Stored in one canonical unit: an integer of hundredths of a square
metre. Displayed as m2 or ft2 according to the viewer's locale. Never stored
twice and never stored as a float.

### 3.2 `properties`

The physical thing. Carries no price.

- Structured address: optional components, a formatted display string, ISO
  country code, coordinates. A UK postcode, a US ZIP and a Nigerian address do
  not share a required-field shape, so components are optional and the formatted
  string is what renders.
- `buildingType`: `house` | `office` | `mixed`
- Canonical area, floors, year built, construction and services notes
- Residential attributes: bedrooms, bathrooms, reception rooms, outdoor space
- Commercial attributes: floor plates, floor-by-floor areas, lift and freight
  provision, clearance height, fit-out state
- Energy rating, ordered media references, features
- Search is by area and by map bounds, never by string match on a street name.

### 3.3 `offers`

One document per way a property is available. A single building may carry a sale
offer, a long-lease offer on floors 2 and 3, and a corporate let on floor 4, each
with its own price, currency, lifecycle and audit trail.

Shared fields: `propertyId`, `type`, `status`, `currency`, `scope` (whole
building | floor | unit), `scopeLabel`, `publishedAt`, `expiresAt`.

Discriminated by `type`:

| `type` | Fields |
|---|---|
| `sale` | guide price, tenure (`freehold` \| `leasehold` \| `commonhold`), lease years remaining, ground rent, service charge, chain status |
| `long_lease` | rent per month, deposit, minimum term in months, furnished state, bills included, service charge, available from |
| `corporate_let` | rate per month, minimum and maximum term (1 to 6 months), available from, available until, serviced level |

Applications, enquiries and payments reference an offer id, because that is what
they are actually about.

### 3.4 Offer lifecycle

A state machine, not a boolean.

```
draft -> pending_review -> live -> under_offer   -> sold
                                -> let_agreed    -> let
```

`withdrawn` and `expired` are reachable from any live state. Every transition is
explicit, validated in `src/domain/`, and writes an audit entry. Expiry matters:
stale listings are the main quality problem on every property site, so a
scheduled job expires offers past `expiresAt` on an interval in the server
process, non-overlapping. A job that only runs when someone opens a page is not
a job.

### 3.5 Remaining collections

`users` (registrants), `staff`, `enquiries`, `applications`, `paymentWindows`,
`payments`, `audit`, `savedSearches`, `favourites`, `mediaAssets`.

## 4. The approval gates

Two gates. Together they are the whole reason the product works the way it does.

### Gate 1: registration review

An unregistered visitor can browse the portfolio. They see photography, area,
aspect, district, and an indicative price band.

Exact address, the full gallery, floor plans, documents and the precise figure
require an approved account. Registration asks about the requirement, not only
for an email address. Staff review each registration and approve or decline it.

Account states: `pending` -> `approved` | `declined`. A declined registrant is
told plainly and is not strung along.

### Gate 2: the payment window

An approved user submits an application against a specific offer: a reservation
on a sale, a tenancy application on a long lease, a booking application on a
corporate let. Staff review it.

Approval creates a **payment window**: single-use, time-boxed, for an exact
amount and currency, bound to that one application.

```
enquiry -> application -> staff review -> approved -> payment window -> paid
```

Properties of the window that make the constraint structural rather than a UI
convention:

- There is no payment route that does not begin at an approved application. A
  payment request naming no live window is rejected at the service layer.
- A window is consumed on first successful payment.
- An expired window cannot be revived. Staff issue a new one, which is a new
  audited decision.
- The amount is fixed at approval time and is not client-supplied.

Application states: `submitted` -> `in_review` -> `approved` | `declined` ->
`paid` | `expired` | `withdrawn`. Every transition is audited.

The payment provider sits behind an interface with a deterministic sandbox
implementation, so the flow is testable offline.

## 5. Architecture

```
src/domain/            pure rules over plain objects. Imports neither Express
                       nor the Mongo driver.
src/db/repositories/   the only files that import the Mongo driver.
src/services/          orchestration, transactions, state machines.
src/routes/            Express 5, thin.
src/views/             Pug, server-rendered.
src/providers/         geocoding, mapping, mail, SMS, payments, image storage,
                       FX. Interface plus deterministic sandbox for each.
public/app.css         one hand-authored stylesheet.
```

### Stack

Bun for everything (`bun install`, `bun run`, `bunx`, `bun test`). Express 5 as
the server, not `Bun.serve()`. Pug server-rendered, no SPA and no client router.
Alpine.js CSP build for interactivity. MongoDB. Plain CSS, no Tailwind, no
CSS-in-JS, no style build step.

### Enforced invariants

MongoDB has no triggers, so rules the reference brief enforced in the database
are enforced in code and verified by tests that read the source.

- **Append-only audit.** The audit repository exposes `append` and read methods
  only. No update and no delete path exists. A collection schema validator backs
  it. Every offer state change, every application decision, every payment event,
  every auth event and every staff action writes an entry.
- **No driver access outside repositories.** A test greps the source.
- **No floats for money.** A test greps for `parseFloat`, `toFixed` and
  `.toNumber()` on money paths.
- **Pure domain.** A test asserts `src/domain/` imports neither Express nor
  `mongodb`.
- **CSP with no `unsafe-inline` and no `unsafe-eval`.** No inline `<style>`, no
  `style=` attributes, no inline `<script>`. Alpine components register through
  `Alpine.data()`; no object literals in `x-data`, no expressions in `x-on`.
- **Content-hashed static assets**, with the hash recomputed per request in
  development, because the file watcher does not restart on `public/` edits.
- **Rate limiting and backoff on every third-party call.** Cache aggressively,
  dedupe concurrent calls into one, back off exponentially, honour
  `Retry-After`, persist the last good response so a restart does not spend a
  call.

## 6. Build order

Vertical slices. Each ends with something clickable and is merged before the
next begins.

0. **Brand.** Identity spec, design tokens, wordmark, voice guide. Little code.
1. **Foundation.** Project setup, config with fail-fast validation, Mongo
   connection and index setup, repository layer, money and area primitives,
   audit log, test harness, the guard tests above, and a Dockerfile verified to
   boot and serve.
2. **Design system and public pages.** Stylesheet, layout, navigation, home,
   about, contact. The visual standard is set here and everything after
   inherits it.
3. **Portfolio, read-only.** Seeded data, search, filters, sort, the offer
   detail page with the gallery and a map, and the unregistered / approved
   split from gate 1. This is the heart of the product and takes the most time.
4. **Accounts and registration review.** Registration, email verification,
   sessions, password reset, optional opt-in two-factor, and the staff
   registration queue. Two-factor is disabled at account creation; when on, a
   fresh code is required for sensitive actions rather than trusting enrolment.
5. **Enquiries and viewings.** Enquiry threads against an offer, viewing
   requests with proposed times, response-time tracking. Neither side's raw
   email or phone number is exposed until both have engaged.
6. **Applications, payment windows and payments.** Gate 2 end to end, the
   payment provider, receipts and refunds.
7. **Staff back office.** Offer authoring with media upload, the state machine,
   registration and application queues, reports and takedowns, user management,
   full audit trail.

## 7. Compliance

Nash Luxury Realty gives no investment advice and makes no representation about property
value or yield. Estate-agency registration and anti-money-laundering checks
apply in several of the markets in scope; the product notes this at its actual
current stage and never claims a status it does not hold.

Fair-housing style rules apply in several jurisdictions. No filter and no piece
of copy may discriminate on a protected characteristic. This constrains what
search facets are allowed to exist.

## 8. Definition of done for any slice

- Every route returns the status it should, verified by calling it.
- Every form submits, validates and shows its errors.
- Every page renders signed out, signed in as a pending registrant, and signed
  in as an approved one.
- Zero axe violations, zero type errors, tests green.
- No horizontal scroll at 360, 480, 720, 960, 1200 and 1440.
- Every screen has an empty state, a loading state and an error state.
- No internal commentary or pre-launch scaffolding visible anywhere.
- Copy reads like a professional property site.
- Committed with a message explaining why, not what.

## 9. Deployment

A container on a host with a persistent disk and a long-running process: Fly.io,
Render, Railway or a VPS. Not Vercel, which runs Node rather than Bun and kills
background intervals. MongoDB runs as a managed instance (Atlas free tier is
sufficient through launch) rather than in the app container.

The Dockerfile and host config are written in slice 1 and verified to boot and
serve, not left to the end. A seed script rebuilds a working demo at boot so the
site is never empty after a restart.
