# Working brief

Product, domain and build order live in
`docs/superpowers/specs/2026-09-02-marchmont-design.md`. This file is the part
that does not change between slices: how to work here, the engineering rules,
the standards, and the traps already paid for.

Carried over from the earlier `estate/BRIEF.md`, adapted for MongoDB and for a
single-company product rather than a marketplace.

---

## 1. How to work with me

This is the part that matters most. Previous sessions lost time here.

**Decide, do not ask.** If there is a clear order of action, take it. Do not
present menus of options I have already implicitly answered. Ask only when two
readings of my request would produce materially different work, and even then
ask once, in one line, and keep working on everything unaffected.

**Investigate before you code, then report before you code.** For any
non-trivial change, anything multi-step, multi-file, or a bug, do not start
editing the moment a root cause looks obvious. Trace the actual mechanism, then
tell me: the root cause, which files change and why, the mechanism of the fix,
and what is already handled versus still open. Then wait for a go-ahead. This is
a hard rule and it recurs; the instinct to patch immediately comes back even
when you have just been told not to.

**Do not narrate testing.** Run tests, fix what breaks, move on. Do not end
messages with pass/fail tallies. Do not re-run a suite that already passed to
reassure me. Mention tests only when something is genuinely broken or a
trade-off needs flagging.

**Verify your own claims before making them.** Do not tell me something works
because the code looks right. Exercise it: run the route, hit the endpoint,
query the database, render the page. Say what you actually observed. When you
are wrong, correct it in one sentence and continue.

**Push back once, then build.** If I ask for something you think is a mistake,
say so in a sentence or two with the reason, then do it anyway if I confirm. Do
not relitigate, and do not quietly do a smaller version of what I asked.

**Never destroy state without checking.** Before dropping a database, deleting a
directory, or removing a branch, check whether a process is using it. A previous
session deleted a running server's database and lost my test data.

**Write like a senior engineer talking to another one.** No preamble, no "Great
question", no restating my request back to me. Lead with the outcome. Comments
in code only where the why is non-obvious; never explain what the code does.

## 2. Engineering rules that are not negotiable

- **Stack is fixed.** Bun for everything. Express 5, not `Bun.serve()`. Pug
  server-rendered, no SPA. Alpine.js CSP build. MongoDB. Plain CSS in one
  stylesheet, no Tailwind and no style build step. If a generated `CLAUDE.md` or
  scaffold contradicts this, it is wrong; replace it.
- **No floating point for money, ever.** `{ amount: Long, currency }` in minor
  units plus ISO 4217. No `parseFloat`, no `toFixed`, no `Long.toNumber()` on a
  monetary value. The driver returns int64 as `Long`, and converting to a JS
  number silently rounds above 2^53. Small test values never trip it, so a
  passing test is not evidence of correctness here.
- **No driver access outside the repository layer.** Routes and services call
  repositories. A test greps the source and will catch you.
- **A pure `src/domain/`** that imports neither Express nor `mongodb`. Business
  rules operate on plain objects and are unit-testable with no server and no
  database.
- **CSP with no `unsafe-inline` and no `unsafe-eval`.** No inline `<style>`, no
  `style=` attributes, no inline `<script>`. Alpine components register through
  `Alpine.data()`; no object literals in `x-data`, no expressions in `x-on`.
- **Content-hash static assets** (`app.css?v=<hash>`) if you serve them with
  long cache headers, and recompute the hash per request in development. The
  watcher does not restart on `public/` edits, so otherwise your CSS changes are
  invisible in the browser and you will lose an hour thinking your styling did
  nothing. This exact trap cost a previous session two rounds of design work.
- **The audit log is append-only.** Mongo has no triggers, so this is enforced
  by a repository that exposes only `append`, a collection schema validator, and
  a test. Every offer state change, application decision, payment event, auth
  event and staff action writes to it.
- **Every external provider sits behind an interface** with a deterministic
  sandbox implementation: geocoding, mapping, email, SMS, image storage,
  payments, currency rates. This keeps vendor choices open and the whole app
  testable offline. The sandbox is a valid choice in any environment, including
  production; that constraint belonged to a regulated product, not this one.
- **Rate-limit and back off on every third-party API.** Cache aggressively,
  dedupe concurrent calls into one, back off exponentially on failure, honour
  `Retry-After`, and persist the last good response so a restart does not spend
  a call. Free tiers of geocoding and FX APIs will 429 you within minutes
  otherwise.

## 3. Design standards

Earlier work was rejected twice as subpar and not elegant. The root cause was
that every quality gate was structural, contrast ratios and axe and byte size,
and none could fail on "this looks bad". So:

- **Look at real comparables before designing.** Study how established property
  sites lay out a listing card, a search result row, a gallery and a detail
  page. Match that density and information hierarchy. Do not invent a novel
  layout for a solved problem.
- **Dark, refined, quiet.** Layered surfaces rather than borders everywhere.
  Restrained accent colour. Generous type scale. Real spacing rhythm from a
  single unit variable. Zero border radius.
- **No card layouts for lists.** Flat rows with hairline dividers. Density beats
  surface treatment. Cards are for the portfolio grid where an image genuinely
  leads; everywhere else, rows.
- **Photography is the product.** Build a proper gallery: lead image, thumbnail
  strip, keyboard navigation, lazy loading, and correct aspect ratios that never
  reflow the page as they load.
- **Responsive at every width**, tested at 1440, 1200, 960, 720, 480 and 360. No
  horizontal overflow anywhere. Use `overflow-x: clip`, not `hidden`, which
  breaks sticky positioning.
- **Zero axe violations.** Correct heading order, no `aria-label` on generic
  divs, no empty table headers, visible focus states, real labels on every
  input.
- **Every screen needs an empty state, a loading state and an error state.** A
  screen that only looks right with data is unfinished.
- **Every page must work at every account state:** signed out, signed in and
  pending review, signed in and approved. A signed-in user must never be shown
  "create an account", and an approved user must never be shown the pending
  notice.

## 4. Copy standards

- **Industry-standard language.** Write what a professional property site
  writes. "3 bed semi-detached", "Available from 1 March", "Guide price",
  "Service charge", "Freehold / Leasehold". Not invented phrasing.
- **No AI voice.** No "Let's dive in", no "seamless", no "elevate", no "unlock",
  no copy that narrates itself. No em dashes or en dashes in interface copy.
- **No internal commentary in the interface.** Never render notes to ourselves:
  no "illustrative", no "placeholder", no "coming soon", no "not yet
  implemented". If a thing is not ready, either do not show it or put the single
  status string behind one constant so switching it on later is one edit and not
  a hunt through the views.
- **Never claim what is not true.** No fake listing counts, no invented
  testimonials, no "trusted by" without anyone to name, no fabricated logos.
- Copy is plain and direct. Say the thing.

## 5. Traps already paid for, do not rediscover these

- `bun init` generates a `CLAUDE.md` that contradicts this stack. Delete it.
- A test asserting a random string does not contain a substring is a coin flip,
  not a test.
- `grep -c` counts matching lines, not occurrences. On minified HTML it will lie
  to you. Use `grep -o | wc -l`.
- Express has its own `request` property; naming a test helper `app.request`
  collides with it.
- An upsert is not an update. A repository method that updates a document which
  does not exist yet silently drops data on the first write. In Mongo this is
  easier to get wrong, because `updateOne` without `upsert` succeeds with
  `matchedCount: 0` and throws nothing.
- Mapping errors by string-matching their message breaks the moment the message
  is reworded. Use typed errors and codes.
- A background job that only runs when someone opens a page is not a background
  job. If something must happen whether or not anyone is watching, run it on an
  interval in the server process, and make it non-overlapping.
- Nav links can out-specify button classes and silently strip their padding.
- A decorative limit is worse than no limit: if the interface displays a cap,
  something must enforce it, and enforcement must fail closed when it cannot be
  measured.

## 6. Definition of done

See section 8 of the spec. Every item is something you have personally checked,
not assumed.

## 7. Housekeeping

- Git identity in this directory is `timileyindev <timmypelumy@gmail.com>`, set
  locally per repo. The global config carries a work identity, so it is set
  before the first commit.
- Commit at the end of each meaningful piece of work. Never commit or push
  without being asked.
- Keep a short operator readme describing how to run it, seed it and deploy it.
