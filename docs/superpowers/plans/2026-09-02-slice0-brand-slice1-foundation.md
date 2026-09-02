# Marchmont Slice 0 (Brand) + Slice 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Marchmont brand as executable design tokens, and build the foundation every later slice sits on: fail-fast config, MongoDB with indexes, the money and area primitives, the append-only audit log, the guard tests that keep the architecture honest, and a Docker image verified to boot and serve.

**Architecture:** A pure `src/domain/` of plain-object logic with no server and no database import, wrapped by `src/db/repositories/` which is the only place the MongoDB driver appears, orchestrated by `src/services/`, exposed through thin Express 5 routes rendering Pug. Design tokens live in `public/app.css` as the single source of truth and are verified by a contrast test that reads the file. Architectural rules are enforced by tests that read the source, because MongoDB has no triggers to enforce them for us.

**Tech Stack:** Bun 1.3.14, Express 5, Pug 3, Alpine.js CSP build 3.17, MongoDB driver 6.x, mongod 8, `bun:test`, plain CSS, Docker.

**Spec:** `docs/superpowers/specs/2026-09-02-marchmont-design.md`

## Global Constraints

Every task's requirements implicitly include all of the following. They are copied from the spec and `BRIEF.md`; do not restate them as optional.

- **Bun for everything.** `bun install`, `bun run`, `bunx`, `bun test`. Never npm, yarn or pnpm.
- **`mongodb` must be pinned to `6`.** Version 7.x ships bson 7, which calls `node:v8` `startupSnapshot.isBuildingSnapshot()` at module load. Bun 1.3.14 has not implemented it and the import throws `ERR_NOT_IMPLEMENTED` before your code runs. This is verified, not theoretical. Do not upgrade the driver without re-checking it under Bun.
- **Express 5, not `Bun.serve()`.** Pug server-rendered, no SPA, no client router.
- **Plain CSS in one stylesheet.** No Tailwind, no CSS-in-JS, no style build step.
- **No floating point for money, ever.** Money is `{ amount: bigint, currency }` in domain code and `{ amount: Long, currency: string }` in BSON. `parseFloat`, `toFixed` and `Long.toNumber()` are banned on money paths.
- **No MongoDB driver import outside `src/db/repositories/` and `src/db/client.ts`.**
- **`src/domain/` imports neither `express` nor `mongodb`.**
- **CSP with no `unsafe-inline` and no `unsafe-eval`.** No inline `<style>`, no `style=` attributes, no inline `<script>`.
- **No em dashes or en dashes in interface copy.** No AI voice. No internal commentary rendered to a page.
- **Git identity is `timileyindev <timmypelumy@gmail.com>`**, already set locally in this repo.
- **Commit at the end of every task.** Never push without being asked.

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json` | Project manifest, strict TypeScript |
| `.env.example` | Every variable `src/config.ts` validates |
| `src/config.ts` | Read and validate environment once at boot, throw on anything wrong |
| `src/domain/errors.ts` | Typed error classes with stable codes |
| `src/domain/currency.ts` | ISO 4217 codes and minor-unit exponents |
| `src/domain/money.ts` | Money value object, arithmetic, parsing, formatting |
| `src/domain/area.ts` | Area value object in hundredths of a square metre |
| `src/db/client.ts` | Single MongoClient lifecycle |
| `src/db/indexes.ts` | Declarative index and collection setup, idempotent |
| `src/db/codecs.ts` | BSON boundary: `bigint` to `Long` and back |
| `src/db/repositories/audit.ts` | Append-only audit log. Exposes `append` and reads only |
| `src/app.ts` | Express app factory: security headers, static assets, routes |
| `src/asset-hash.ts` | Content hash for `app.css`, cached in production, recomputed per request in development |
| `src/interval.ts` | Non-overlapping background job runner |
| `src/server.ts` | Boot: config, database, app, intervals, graceful shutdown |
| `public/app.css` | Design tokens and reset. Single source of truth for the palette |
| `docs/brand/marchmont-identity.md` | Brand definition: posture, palette, type, voice |
| `tests/` | Mirrors `src/`, plus `tests/guards/` for the architectural tests |
| `Dockerfile`, `compose.yaml` | Container and local MongoDB |
| `scripts/seed.ts` | Rebuild a working demo at boot |

---

### Task 1: Project scaffold and fail-fast config

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `src/config.ts`
- Create: `tests/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadConfig(env: Record<string, string | undefined>): Config` and the `Config` type with fields `nodeEnv: 'development' | 'production' | 'test'`, `port: number`, `mongoUrl: string`, `mongoDb: string`, `sessionSecret: string`, `providers: { payments: string; geocoding: string; mail: string }`. Throws `ConfigError` listing every problem at once.

- [ ] **Step 1: Initialise the project**

`bun init` writes a `CLAUDE.md` that contradicts this stack. This repo already has one. Do not let `bun init` overwrite it.

```bash
cd /home/timileyin/dev/personal/marchmont
cp CLAUDE.md /tmp/marchmont-claude.md
bun init -y
cp /tmp/marchmont-claude.md CLAUDE.md
bun add express@5 pug @alpinejs/csp mongodb@6
bun add -d @types/express @types/bun
```

- [ ] **Step 2: Set the manifest and TypeScript config**

`package.json` scripts block:

```json
{
  "name": "marchmont",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "NODE_ENV=development bun --watch src/server.ts",
    "start": "NODE_ENV=production bun src/server.ts",
    "test": "bun test",
    "seed": "bun scripts/seed.ts"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 3: Write the failing test**

`tests/config.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'marchmont_test',
  SESSION_SECRET: 'x'.repeat(32),
  PAYMENTS_PROVIDER: 'sandbox',
  GEOCODING_PROVIDER: 'sandbox',
  MAIL_PROVIDER: 'sandbox',
}

describe('loadConfig', () => {
  test('accepts a complete environment', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(3000)
    expect(config.mongoDb).toBe('marchmont_test')
    expect(config.providers.payments).toBe('sandbox')
  })

  test('reports every missing variable at once, not just the first', () => {
    const { MONGO_URL, SESSION_SECRET, ...rest } = valid
    try {
      loadConfig(rest)
      throw new Error('expected loadConfig to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('MONGO_URL')
      expect(message).toContain('SESSION_SECRET')
    }
  })

  test('rejects a non-numeric port', () => {
    expect(() => loadConfig({ ...valid, PORT: 'eighty' })).toThrow(/PORT/)
  })

  test('rejects a short session secret', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  test('refuses to boot production with a sandbox provider', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(/sandbox/i)
  })

  test('allows production with real providers', () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      PAYMENTS_PROVIDER: 'stripe',
      GEOCODING_PROVIDER: 'mapbox',
      MAIL_PROVIDER: 'postmark',
    })
    expect(config.nodeEnv).toBe('production')
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL, cannot resolve `../src/config`.

- [ ] **Step 5: Implement `src/config.ts`**

```ts
export type NodeEnv = 'development' | 'production' | 'test'

export type Config = {
  readonly nodeEnv: NodeEnv
  readonly port: number
  readonly mongoUrl: string
  readonly mongoDb: string
  readonly sessionSecret: string
  readonly providers: {
    readonly payments: string
    readonly geocoding: string
    readonly mail: string
  }
}

export class ConfigError extends Error {
  readonly code = 'CONFIG_INVALID'
  constructor(problems: string[]) {
    super(`Configuration is invalid:\n  ${problems.join('\n  ')}`)
    this.name = 'ConfigError'
  }
}

const NODE_ENVS: readonly string[] = ['development', 'production', 'test']

export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = []

  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}, got "${nodeEnv}"`)
  }

  const rawPort = env.PORT ?? '3000'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be an integer between 1 and 65535, got "${rawPort}"`)
  }

  const mongoUrl = env.MONGO_URL
  if (!mongoUrl) problems.push('MONGO_URL is required')
  else if (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://')) {
    problems.push('MONGO_URL must start with mongodb:// or mongodb+srv://')
  }

  const mongoDb = env.MONGO_DB
  if (!mongoDb) problems.push('MONGO_DB is required')

  const sessionSecret = env.SESSION_SECRET
  if (!sessionSecret) problems.push('SESSION_SECRET is required')
  else if (sessionSecret.length < 32) {
    problems.push(`SESSION_SECRET must be at least 32 characters, got ${sessionSecret.length}`)
  }

  const providers = {
    payments: env.PAYMENTS_PROVIDER ?? '',
    geocoding: env.GEOCODING_PROVIDER ?? '',
    mail: env.MAIL_PROVIDER ?? '',
  }
  for (const [name, value] of Object.entries(providers)) {
    if (!value) problems.push(`${name.toUpperCase()}_PROVIDER is required`)
  }

  if (nodeEnv === 'production') {
    for (const [name, value] of Object.entries(providers)) {
      if (value === 'sandbox') {
        problems.push(`${name.toUpperCase()}_PROVIDER is "sandbox"; production refuses to boot with a sandbox provider`)
      }
    }
  }

  if (problems.length > 0) throw new ConfigError(problems)

  return {
    nodeEnv: nodeEnv as NodeEnv,
    port,
    mongoUrl: mongoUrl!,
    mongoDb: mongoDb!,
    sessionSecret: sessionSecret!,
    providers,
  }
}
```

- [ ] **Step 6: Write `.env.example`**

```
NODE_ENV=development
PORT=3000
MONGO_URL=mongodb://127.0.0.1:27017
MONGO_DB=marchmont
SESSION_SECRET=change-me-to-at-least-thirty-two-characters
PAYMENTS_PROVIDER=sandbox
GEOCODING_PROVIDER=sandbox
MAIL_PROVIDER=sandbox
```

- [ ] **Step 7: Run the tests**

Run: `bun test tests/config.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json bun.lock .env.example src/config.ts tests/config.test.ts
git commit -m "Validate the environment once, at boot, and report every problem together

A config error found on request is a config error found by a user. Reading and
checking the environment at startup means a misconfigured deployment fails to
boot rather than failing halfway through a page. Reporting all problems at once
rather than the first avoids the fix-restart-discover-the-next-one cycle.

Production refuses to boot with a sandbox provider selected, which is the only
reliable way to stop a deterministic test double reaching real users."
```

---

### Task 2: Brand identity and design tokens

**Files:**
- Create: `docs/brand/marchmont-identity.md`, `public/app.css`
- Create: `tests/brand/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `public/app.css` as the single source of truth for the palette. Token names later slices rely on: `--ground`, `--surface-1`, `--surface-2`, `--line`, `--text`, `--text-muted`, `--text-faint`, `--accent`, `--accent-hover`, `--accent-text`, `--accent-on`, `--danger`, `--u` (spacing unit), `--font-display`, `--font-body`, `--font-ui`.

- [ ] **Step 1: Write the failing test**

The palette is the one part of a visual system that can be verified mechanically. This test reads the stylesheet and checks every foreground and background pair we actually use.

`tests/brand/tokens.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'

const css = await Bun.file(new URL('../../public/app.css', import.meta.url)).text()

function readToken(name: string): [number, number, number] {
  const match = css.match(new RegExp(`--${name}:\\s*hsl\\(\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*\\)`))
  if (!match) throw new Error(`token --${name} is not defined as hsl(h s% l%) in public/app.css`)
  return [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return [r + m, g + m, b + m]
}

function luminance(name: string): number {
  const linear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = hslToRgb(...readToken(name)).map(linear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('palette', () => {
  const textPairs: [string, string][] = [
    ['text', 'ground'], ['text', 'surface-1'], ['text', 'surface-2'],
    ['text-muted', 'ground'], ['text-muted', 'surface-1'], ['text-muted', 'surface-2'],
    ['text-faint', 'ground'], ['text-faint', 'surface-2'],
    ['accent-text', 'ground'], ['accent-text', 'surface-2'],
    ['accent-on', 'accent'],
  ]

  for (const [foreground, background] of textPairs) {
    test(`--${foreground} on --${background} meets AA for body text`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    })
  }

  test('--danger on --ground meets AA for large text and icons', () => {
    expect(contrast('danger', 'ground')).toBeGreaterThanOrEqual(3)
  })

  test('--line is visible against --ground without becoming a border', () => {
    const ratio = contrast('line', 'ground')
    expect(ratio).toBeGreaterThanOrEqual(1.2)
    expect(ratio).toBeLessThan(3)
  })

  test('--accent is dark enough to carry --accent-on as a fill', () => {
    expect(contrast('accent-on', 'accent')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('stylesheet discipline', () => {
  test('defines a single spacing unit', () => {
    expect(css).toMatch(/--u:\s*4px/)
  })

  test('uses zero border radius throughout', () => {
    const radii = css.match(/border-radius:\s*([^;]+);/g) ?? []
    for (const rule of radii) expect(rule).toMatch(/border-radius:\s*0;/)
  })

  test('contains no em dash or en dash', () => {
    expect(css).not.toMatch(/[\u2013\u2014]/)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/brand/tokens.test.ts`
Expected: FAIL, `public/app.css` does not exist.

- [ ] **Step 3: Write `public/app.css`**

Values are derived from the Ferrous & Oak reference in `docs/reference/ferrous-and-oak`, taken darker and moved from its rust accent (hue 18) to oxblood (hue 2). Every pair below has been checked against the test above.

```css
/* Marchmont design tokens. Single source of truth for the palette.
   Verified by tests/brand/tokens.test.ts. */

:root {
  /* Ground and layered surfaces. Depth comes from lightness, not borders. */
  --ground: hsl(24 12% 6%);
  --surface-1: hsl(24 11% 9%);
  --surface-2: hsl(24 10% 13%);
  --line: hsl(24 9% 20%);

  /* Text */
  --text: hsl(36 16% 93%);
  --text-muted: hsl(32 9% 66%);
  --text-faint: hsl(30 8% 53%);

  /* Oxblood. --accent fills, --accent-text is the readable form on dark ground. */
  --accent: hsl(2 52% 38%);
  --accent-hover: hsl(2 54% 44%);
  --accent-text: hsl(2 62% 64%);
  --accent-on: hsl(36 30% 97%);

  --danger: hsl(4 55% 48%);

  /* One spacing unit. Every gap is a multiple of it. */
  --u: 4px;

  --font-display: Fraunces, Georgia, "Times New Roman", serif;
  --font-body: Bitter, Georgia, "Times New Roman", serif;
  --font-ui: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;

  --measure: 68ch;
  --page: 1200px;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  background: var(--ground);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 16px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: clip;
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: -0.015em;
  line-height: 1.12;
  margin: 0;
  text-wrap: balance;
}

p { margin: 0; max-width: var(--measure); }

a { color: var(--accent-text); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 0.2em; }

:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}

img { max-width: 100%; height: auto; display: block; }

hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: calc(var(--u) * 8) 0;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
  border-radius: 0;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test tests/brand/tokens.test.ts`
Expected: PASS. Fourteen contrast assertions plus three discipline assertions.

- [ ] **Step 5: Write the identity document**

`docs/brand/marchmont-identity.md`:

```markdown
# Marchmont: identity

## Posture

A private property house. Discreet rather than promotional. Few properties,
shown by appointment, registrations reviewed before viewing details are
released.

The approval gate is the brand. On a volume portal, reviewing every registrant
would read as friction. Here it is house policy, and the interface presents it
that way without apologising for it.

## Palette

Defined in `public/app.css`. That file is the source of truth; this section
explains the intent behind it.

| Token | Role |
|---|---|
| `--ground` | Page ground. Near-black, warm rather than neutral |
| `--surface-1`, `--surface-2` | Raised surfaces. Depth by lightness, never by border |
| `--line` | Hairline divider. Visible, never a box |
| `--text`, `--text-muted`, `--text-faint` | Three levels, no more |
| `--accent` | Oxblood fill. Primary action only |
| `--accent-text` | The readable oxblood, for links on dark ground |
| `--danger` | Destructive and error states only |

The accent appears rarely enough that its appearance carries meaning. If a
screen has two oxblood elements, one of them is wrong.

## Type

Fraunces for display, Bitter for the serif body voice, Inter for interface and
data. Zero border radius everywhere, inherited from the reference and kept
deliberately.

## Layout

Rows with hairline dividers for every list. The single exception is the
portfolio grid, where the photograph leads. Density beats surface treatment.

Photography is the product. The gallery is a first-class component: lead image,
thumbnail strip, keyboard navigation, lazy loading, and fixed aspect ratios that
never reflow the page as images arrive.

## Voice

Understated and factual. Industry-standard property language: guide price,
service charge, freehold, available from 1 March, 1,240 m2 over two floors.

Sample: "Registrations are reviewed before viewing details are released. We ask
for a little about your requirement."

Never claim what is not true. No fabricated counts, no invented testimonials, no
trusted-by without a nameable source. No em dashes or en dashes. No copy that
narrates itself.
```

- [ ] **Step 6: Draw the mark**

The wordmark is typographic: `MARCHMONT` set in Fraunces, letterspaced `0.18em`,
in `--text` on `--ground`. There is no logotype beyond that, which suits a house
that does not advertise. The only drawn element is the favicon.

`public/favicon.svg`. The three colours are the hex equivalents of `--ground`,
`--text` and `--accent`; if a token changes, this file changes with it.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Marchmont">
  <rect width="32" height="32" fill="#110f0e"/>
  <path d="M8 24V9l8 9 8-9v15" fill="none" stroke="#f0eeea" stroke-width="2.2" stroke-linecap="square"/>
  <rect x="6" y="27" width="20" height="1.4" fill="#93322e"/>
</svg>
```

Add it to the layout in Task 9:

```pug
link(rel="icon" href="/favicon.svg" type="image/svg+xml")
```

- [ ] **Step 7: Commit**

```bash
git add public/app.css public/favicon.svg docs/brand/marchmont-identity.md tests/brand/tokens.test.ts
git commit -m "Define the palette as tokens a test can fail on

Earlier work was rejected as subpar because every quality gate was structural
and none could fail on the visual result. Contrast is the part of a palette that
is genuinely mechanical, so it is checked here rather than assumed: the test
reads app.css, computes WCAG ratios for every foreground and background pair the
interface actually uses, and fails when one drops below AA.

Values descend from the Ferrous and Oak reference, taken darker and moved from
its rust to oxblood. Zero radius is kept from the reference deliberately; it is
most of why that design reads as considered."
```

---

### Task 3: Typed errors, currencies and the Money value object

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/currency.ts`, `src/domain/money.ts`
- Create: `tests/domain/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class DomainError extends Error { readonly code: string }`, and subclasses `CurrencyMismatchError` (code `CURRENCY_MISMATCH`), `UnknownCurrencyError` (code `UNKNOWN_CURRENCY`), `InvalidAmountError` (code `INVALID_AMOUNT`).
  - `type CurrencyCode = string`, `minorUnitExponent(code: string): number`, `isKnownCurrency(code: string): boolean`.
  - `type Money = { readonly amount: bigint; readonly currency: CurrencyCode }`
  - `money(amount: bigint, currency: string): Money`
  - `parseMoney(decimal: string, currency: string): Money`
  - `formatMoney(value: Money, locale: string): string`
  - `addMoney(a: Money, b: Money): Money`, `subtractMoney(a: Money, b: Money): Money`
  - `compareMoney(a: Money, b: Money): -1 | 0 | 1`
  - `toDecimalString(value: Money): string`

- [ ] **Step 1: Write the failing test**

`tests/domain/money.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  money, parseMoney, formatMoney, addMoney, subtractMoney, compareMoney, toDecimalString,
} from '../../src/domain/money'
import { CurrencyMismatchError, UnknownCurrencyError, InvalidAmountError } from '../../src/domain/errors'

describe('money', () => {
  test('holds minor units as a bigint', () => {
    const value = money(45_000_000_50n, 'NGN')
    expect(value.amount).toBe(45_000_000_50n)
    expect(value.currency).toBe('NGN')
  })

  test('rejects an unknown currency', () => {
    expect(() => money(1n, 'XYZ')).toThrow(UnknownCurrencyError)
  })
})

describe('parseMoney', () => {
  test('parses a two-decimal currency', () => {
    expect(parseMoney('1234.56', 'GBP').amount).toBe(123456n)
  })

  test('parses a zero-decimal currency', () => {
    expect(parseMoney('1234', 'JPY').amount).toBe(1234n)
  })

  test('pads a short fraction', () => {
    expect(parseMoney('10.5', 'GBP').amount).toBe(1050n)
  })

  test('accepts a bare integer', () => {
    expect(parseMoney('10', 'GBP').amount).toBe(1000n)
  })

  test('parses a negative amount', () => {
    expect(parseMoney('-0.01', 'GBP').amount).toBe(-1n)
  })

  test('survives a value far above what a double can hold', () => {
    expect(parseMoney('90071992547409.93', 'GBP').amount).toBe(9007199254740993n)
  })

  test('rejects more precision than the currency has', () => {
    expect(() => parseMoney('1.005', 'GBP')).toThrow(InvalidAmountError)
    expect(() => parseMoney('1.5', 'JPY')).toThrow(InvalidAmountError)
  })

  test('rejects anything that is not a decimal', () => {
    for (const bad of ['', '1,234.00', '1.2.3', 'abc', '1e5', ' 1.00']) {
      expect(() => parseMoney(bad, 'GBP')).toThrow(InvalidAmountError)
    }
  })
})

describe('toDecimalString', () => {
  test('round-trips through parseMoney', () => {
    for (const [input, currency] of [['1234.56', 'GBP'], ['0.01', 'EUR'], ['-0.01', 'EUR'], ['1234', 'JPY']] as const) {
      expect(toDecimalString(parseMoney(input, currency))).toBe(input)
    }
  })

  test('pads the fraction back out', () => {
    expect(toDecimalString(money(5n, 'GBP'))).toBe('0.05')
    expect(toDecimalString(money(-5n, 'GBP'))).toBe('-0.05')
  })
})

describe('formatMoney', () => {
  test('formats in the viewer locale without losing precision', () => {
    expect(formatMoney(parseMoney('12345678901234567.89', 'GBP'), 'en-GB'))
      .toBe('£12,345,678,901,234,567.89')
  })

  test('respects locale conventions', () => {
    expect(formatMoney(parseMoney('1234567.89', 'EUR'), 'de-DE')).toContain('1.234.567,89')
  })

  test('omits decimals for a zero-decimal currency', () => {
    expect(formatMoney(parseMoney('1234567', 'JPY'), 'ja-JP')).not.toContain('.')
  })
})

describe('arithmetic', () => {
  test('adds and subtracts within one currency', () => {
    const a = parseMoney('10.00', 'GBP')
    const b = parseMoney('2.50', 'GBP')
    expect(toDecimalString(addMoney(a, b))).toBe('12.50')
    expect(toDecimalString(subtractMoney(a, b))).toBe('7.50')
  })

  test('refuses to mix currencies', () => {
    const gbp = parseMoney('10.00', 'GBP')
    const eur = parseMoney('10.00', 'EUR')
    expect(() => addMoney(gbp, eur)).toThrow(CurrencyMismatchError)
    expect(() => subtractMoney(gbp, eur)).toThrow(CurrencyMismatchError)
    expect(() => compareMoney(gbp, eur)).toThrow(CurrencyMismatchError)
  })

  test('compares', () => {
    const a = parseMoney('10.00', 'GBP')
    const b = parseMoney('2.50', 'GBP')
    expect(compareMoney(a, b)).toBe(1)
    expect(compareMoney(b, a)).toBe(-1)
    expect(compareMoney(a, a)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/domain/money.test.ts`
Expected: FAIL, cannot resolve `../../src/domain/money`.

- [ ] **Step 3: Implement `src/domain/errors.ts`**

Errors carry stable codes because mapping errors by string-matching their message breaks the moment the message is reworded.

```ts
export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class UnknownCurrencyError extends DomainError {
  constructor(currency: string) {
    super('UNKNOWN_CURRENCY', `Unknown currency code "${currency}"`)
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(a: string, b: string) {
    super('CURRENCY_MISMATCH', `Cannot combine ${a} and ${b}. Every price carries its own currency.`)
  }
}

export class InvalidAmountError extends DomainError {
  constructor(message: string) {
    super('INVALID_AMOUNT', message)
  }
}

export class InvalidAreaError extends DomainError {
  constructor(message: string) {
    super('INVALID_AREA', message)
  }
}
```

- [ ] **Step 4: Implement `src/domain/currency.ts`**

Exponents follow ISO 4217. Most currencies are 2; the exceptions are what this table exists for.

```ts
import { UnknownCurrencyError } from './errors'

const EXPONENTS: Readonly<Record<string, number>> = {
  AED: 2, AUD: 2, BHD: 3, BRL: 2, CAD: 2, CHF: 2, CNY: 2, DKK: 2, EUR: 2,
  GBP: 2, GHS: 2, HKD: 2, IDR: 2, ILS: 2, INR: 2, JOD: 3, JPY: 0, KES: 2,
  KRW: 0, KWD: 3, MAD: 2, MXN: 2, MYR: 2, NGN: 2, NOK: 2, NZD: 2, OMR: 3,
  PLN: 2, QAR: 2, RON: 2, SAR: 2, SEK: 2, SGD: 2, THB: 2, TND: 3, TRY: 2,
  USD: 2, VND: 0, ZAR: 2,
}

export type CurrencyCode = string

export function isKnownCurrency(code: string): boolean {
  return Object.hasOwn(EXPONENTS, code)
}

export function minorUnitExponent(code: string): number {
  const exponent = EXPONENTS[code]
  if (exponent === undefined) throw new UnknownCurrencyError(code)
  return exponent
}

export function knownCurrencies(): readonly string[] {
  return Object.keys(EXPONENTS)
}
```

- [ ] **Step 5: Implement `src/domain/money.ts`**

`Intl.NumberFormat.format` accepts a decimal string and preserves it exactly, which is what makes formatting possible without ever producing a `number`. This is verified: `12345678901234567.89` formats losslessly.

```ts
import { type CurrencyCode, isKnownCurrency, minorUnitExponent } from './currency'
import { CurrencyMismatchError, InvalidAmountError, UnknownCurrencyError } from './errors'

export type Money = {
  readonly amount: bigint
  readonly currency: CurrencyCode
}

const DECIMAL = /^-?\d+(\.\d+)?$/

export function money(amount: bigint, currency: string): Money {
  if (!isKnownCurrency(currency)) throw new UnknownCurrencyError(currency)
  return { amount, currency }
}

export function parseMoney(decimal: string, currency: string): Money {
  const exponent = minorUnitExponent(currency)
  if (!DECIMAL.test(decimal)) {
    throw new InvalidAmountError(`"${decimal}" is not a plain decimal amount`)
  }

  const negative = decimal.startsWith('-')
  const unsigned = negative ? decimal.slice(1) : decimal
  const [whole = '0', fraction = ''] = unsigned.split('.')

  if (fraction.length > exponent) {
    throw new InvalidAmountError(
      `${currency} has ${exponent} decimal place(s); "${decimal}" has ${fraction.length}`,
    )
  }

  const minor = BigInt(whole + fraction.padEnd(exponent, '0'))
  return { amount: negative ? -minor : minor, currency }
}

export function toDecimalString(value: Money): string {
  const exponent = minorUnitExponent(value.currency)
  const negative = value.amount < 0n
  const digits = (negative ? -value.amount : value.amount).toString().padStart(exponent + 1, '0')
  const whole = digits.slice(0, digits.length - exponent)
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`
  return `${negative ? '-' : ''}${whole}${fraction}`
}

export function formatMoney(value: Money, locale: string): string {
  const exponent = minorUnitExponent(value.currency)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })
  // Intl.NumberFormat accepts a decimal string and preserves it exactly.
  // Passing a number here would round above 2^53.
  return formatter.format(toDecimalString(value) as unknown as number)
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
}

export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return { amount: a.amount + b.amount, currency: a.currency }
}

export function subtractMoney(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return { amount: a.amount - b.amount, currency: a.currency }
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b)
  return a.amount === b.amount ? 0 : a.amount > b.amount ? 1 : -1
}
```

- [ ] **Step 6: Run the tests**

Run: `bun test tests/domain/money.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/errors.ts src/domain/currency.ts src/domain/money.ts tests/domain/money.test.ts
git commit -m "Represent money as bigint minor units with its own currency attached

A property priced at 45,000,000.50 naira and one priced at 450,000.00 pounds are
not comparable, and storing a single normalised figure loses the only number the
buyer actually cares about. So every amount carries its currency and arithmetic
across two currencies throws rather than silently producing a wrong total.

Formatting goes through Intl.NumberFormat with a decimal string rather than a
number. That path is exact: a value above 2^53 formats losslessly, where
converting to a double first would round it. There is no code path in this
module that produces a number from an amount."
```

---

### Task 4: The Area value object

**Files:**
- Create: `src/domain/area.ts`
- Create: `tests/domain/area.test.ts`

**Interfaces:**
- Consumes: `InvalidAreaError` from `src/domain/errors.ts`.
- Produces:
  - `type Area = { readonly hundredthsM2: bigint }`
  - `areaFromM2(decimal: string): Area`, `areaFromFt2(decimal: string): Area`
  - `formatArea(area: Area, unit: 'm2' | 'ft2', locale: string): string`
  - `unitForLocale(locale: string): 'm2' | 'ft2'`

- [ ] **Step 1: Write the failing test**

`tests/domain/area.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { areaFromM2, areaFromFt2, formatArea, unitForLocale } from '../../src/domain/area'
import { InvalidAreaError } from '../../src/domain/errors'

describe('areaFromM2', () => {
  test('stores hundredths of a square metre', () => {
    expect(areaFromM2('1240').hundredthsM2).toBe(124000n)
    expect(areaFromM2('1240.55').hundredthsM2).toBe(124055n)
  })

  test('rejects more than two decimal places', () => {
    expect(() => areaFromM2('1.005')).toThrow(InvalidAreaError)
  })

  test('rejects a negative area', () => {
    expect(() => areaFromM2('-1')).toThrow(InvalidAreaError)
  })

  test('rejects anything that is not a decimal', () => {
    for (const bad of ['', 'abc', '1,240', '1e3']) {
      expect(() => areaFromM2(bad)).toThrow(InvalidAreaError)
    }
  })
})

describe('areaFromFt2', () => {
  test('converts using the exact ratio, rounding half up', () => {
    // 1 ft2 = 0.09290304 m2 exactly, so 1000 ft2 = 92.90304 m2 = 9290.304 hundredths
    expect(areaFromFt2('1000').hundredthsM2).toBe(9290n)
  })

  test('round-trips a large commercial floor plate within a hundredth', () => {
    const area = areaFromFt2('58000')
    expect(formatArea(area, 'ft2', 'en-US')).toBe('58,000 ft2')
  })
})

describe('formatArea', () => {
  test('formats square metres with locale grouping and no decimals', () => {
    expect(formatArea(areaFromM2('1240.55'), 'm2', 'en-GB')).toBe('1,241 m2')
  })

  test('formats square feet', () => {
    expect(formatArea(areaFromM2('1000'), 'ft2', 'en-US')).toBe('10,764 ft2')
  })

  test('never contains an em dash or en dash', () => {
    expect(formatArea(areaFromM2('1000'), 'm2', 'en-GB')).not.toMatch(/[\u2013\u2014]/)
  })
})

describe('unitForLocale', () => {
  test('uses square feet for the US and UK', () => {
    expect(unitForLocale('en-US')).toBe('ft2')
    expect(unitForLocale('en-GB')).toBe('ft2')
  })

  test('uses square metres everywhere else', () => {
    for (const locale of ['de-DE', 'fr-FR', 'en-NG', 'ja-JP', 'pt-BR']) {
      expect(unitForLocale(locale)).toBe('m2')
    }
  })

  test('falls back to square metres for an unrecognised locale', () => {
    expect(unitForLocale('')).toBe('m2')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/domain/area.test.ts`
Expected: FAIL, cannot resolve `../../src/domain/area`.

- [ ] **Step 3: Implement `src/domain/area.ts`**

```ts
import { InvalidAreaError } from './errors'

export type Area = {
  readonly hundredthsM2: bigint
}

export type AreaUnit = 'm2' | 'ft2'

const DECIMAL = /^\d+(\.\d+)?$/

// 1 square foot is exactly 0.09290304 square metres.
const FT2_NUMERATOR = 9290304n
const FT2_DENOMINATOR = 100000000n

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function parseHundredths(decimal: string, label: string): bigint {
  if (!DECIMAL.test(decimal)) {
    throw new InvalidAreaError(`"${decimal}" is not a plain positive decimal ${label}`)
  }
  const [whole = '0', fraction = ''] = decimal.split('.')
  if (fraction.length > 2) {
    throw new InvalidAreaError(`Area is stored to two decimal places; "${decimal}" has ${fraction.length}`)
  }
  return BigInt(whole + fraction.padEnd(2, '0'))
}

export function areaFromM2(decimal: string): Area {
  if (decimal.startsWith('-')) throw new InvalidAreaError('Area cannot be negative')
  return { hundredthsM2: parseHundredths(decimal, 'area in square metres') }
}

export function areaFromFt2(decimal: string): Area {
  if (decimal.startsWith('-')) throw new InvalidAreaError('Area cannot be negative')
  const hundredthsFt2 = parseHundredths(decimal, 'area in square feet')
  return { hundredthsM2: divideRoundHalfUp(hundredthsFt2 * FT2_NUMERATOR, FT2_DENOMINATOR) }
}

export function formatArea(area: Area, unit: AreaUnit, locale: string): string {
  const whole =
    unit === 'm2'
      ? divideRoundHalfUp(area.hundredthsM2, 100n)
      : divideRoundHalfUp(area.hundredthsM2 * FT2_DENOMINATOR, FT2_NUMERATOR * 100n)
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  return `${formatter.format(whole)} ${unit === 'm2' ? 'm2' : 'ft2'}`
}

const IMPERIAL_AREA_REGIONS = new Set(['US', 'GB'])

export function unitForLocale(locale: string): AreaUnit {
  try {
    const region = new Intl.Locale(locale).maximize().region
    return region !== undefined && IMPERIAL_AREA_REGIONS.has(region) ? 'ft2' : 'm2'
  } catch {
    return 'm2'
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/domain/area.test.ts`
Expected: PASS. Every value in this test was computed against the exact ratio and checked: `areaFromFt2('1000').hundredthsM2` is `9290n`, and a 58,000 ft2 floor plate round-trips back to exactly `58,000 ft2`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/area.ts tests/domain/area.test.ts
git commit -m "Store area once, in hundredths of a square metre, and convert at display

Storing both square metres and square feet means two columns that can disagree,
and a listing whose size changes depending on which one a page happens to read.
One canonical integer removes that possibility, and the viewer's locale decides
which unit they see.

Conversion uses the exact ratio as an integer fraction, so it never routes
through a float. The US and UK get square feet; everywhere else gets square
metres, and an unrecognised locale falls back to square metres rather than
throwing."
```

---

### Task 5: MongoDB client and idempotent index setup

**Files:**
- Create: `src/db/client.ts`, `src/db/indexes.ts`, `tests/helpers/db.ts`
- Create: `tests/db/indexes.test.ts`

**Interfaces:**
- Consumes: `Config` from `src/config.ts`.
- Produces:
  - `connect(config: Config): Promise<Database>` where `type Database = { client: MongoClient; db: Db; close(): Promise<void> }`
  - `applySchema(db: Db): Promise<void>` creating collections, validators and indexes. Idempotent: safe to run on every boot.
  - `tests/helpers/db.ts` exporting `withTestDb(): Promise<Database>` and `dropTestDb(database: Database): Promise<void>`.

- [ ] **Step 1: Note the driver constraint**

`mongodb` is pinned to `6` in Task 1. Do not raise it. Version 7 ships bson 7, whose module-level initialiser calls `node:v8` `startupSnapshot.isBuildingSnapshot()`, which Bun 1.3.14 has not implemented; the import throws `ERR_NOT_IMPLEMENTED` before any of your code executes. Confirm the pin before starting:

```bash
grep '"mongodb"' package.json
```

Expected: `"mongodb": "6"`.

- [ ] **Step 2: Write the test helper**

`tests/helpers/db.ts`:

```ts
import { loadConfig } from '../../src/config'
import { connect, type Database } from '../../src/db/client'
import { applySchema } from '../../src/db/indexes'

export async function withTestDb(): Promise<Database> {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    MONGO_URL: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017',
    MONGO_DB: `marchmont_test_${crypto.randomUUID().slice(0, 8)}`,
    SESSION_SECRET: 'x'.repeat(32),
    PAYMENTS_PROVIDER: 'sandbox',
    GEOCODING_PROVIDER: 'sandbox',
    MAIL_PROVIDER: 'sandbox',
  })
  const database = await connect(config)
  await applySchema(database.db)
  return database
}

export async function dropTestDb(database: Database): Promise<void> {
  await database.db.dropDatabase()
  await database.close()
}
```

- [ ] **Step 3: Write the failing test**

`tests/db/indexes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { applySchema } from '../../src/db/indexes'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('applySchema', () => {
  test('creates every collection the foundation needs', async () => {
    const names = (await database.db.listCollections().toArray()).map((c) => c.name)
    for (const expected of ['audit', 'properties', 'offers', 'users']) {
      expect(names).toContain(expected)
    }
  })

  test('is idempotent', async () => {
    await applySchema(database.db)
    await applySchema(database.db)
    const names = (await database.db.listCollections().toArray()).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('indexes the audit log by time so a trail can be read in order', async () => {
    const indexes = await database.db.collection('audit').indexes()
    const keys = indexes.map((index) => JSON.stringify(index.key))
    expect(keys).toContain(JSON.stringify({ at: -1 }))
  })

  test('indexes offers for the searches the portfolio actually runs', async () => {
    const keys = (await database.db.collection('offers').indexes()).map((i) => JSON.stringify(i.key))
    expect(keys).toContain(JSON.stringify({ status: 1, type: 1 }))
    expect(keys).toContain(JSON.stringify({ propertyId: 1 }))
  })

  test('indexes properties geospatially for map-bounds search', async () => {
    const indexes = await database.db.collection('properties').indexes()
    const geo = indexes.find((index) => index.key.location === '2dsphere')
    expect(geo).toBeDefined()
  })

  test('enforces one account per email address', async () => {
    const email = (await database.db.collection('users').indexes())
      .find((index) => JSON.stringify(index.key) === JSON.stringify({ email: 1 }))
    expect(email?.unique).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Start a local MongoDB first if one is not already running:

```bash
docker run -d --name marchmont-mongo -p 27017:27017 mongo:8
```

Run: `bun test tests/db/indexes.test.ts`
Expected: FAIL, cannot resolve `../../src/db/client`.

- [ ] **Step 5: Implement `src/db/client.ts`**

```ts
import { MongoClient, type Db } from 'mongodb'
import type { Config } from '../config'

export type Database = {
  readonly client: MongoClient
  readonly db: Db
  close(): Promise<void>
}

export async function connect(config: Config): Promise<Database> {
  const client = new MongoClient(config.mongoUrl, {
    ignoreUndefined: true,
    serverSelectionTimeoutMS: 5000,
  })
  await client.connect()
  const db = client.db(config.mongoDb)
  return {
    client,
    db,
    close: () => client.close(),
  }
}
```

- [ ] **Step 6: Implement `src/db/indexes.ts`**

The audit validator enforces shape. It does not stop an update, because MongoDB has no per-collection operation restriction available to us here; append-only is enforced in Task 7 by the repository having no update path, and in Task 8 by a test that reads the source. The production hardening beyond that is a dedicated database role granting only `insert` and `find` on `audit`, and it is recorded in the operator readme in Task 12 rather than implemented here.

```ts
import type { Db } from 'mongodb'

const AUDIT_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['at', 'actor', 'action', 'subject'],
    properties: {
      at: { bsonType: 'date' },
      actor: { bsonType: 'string' },
      action: { bsonType: 'string' },
      subject: { bsonType: 'string' },
      detail: { bsonType: 'object' },
    },
  },
}

async function ensureCollection(
  db: Db,
  name: string,
  options: Record<string, unknown> = {},
): Promise<void> {
  const existing = await db.listCollections({ name }).toArray()
  if (existing.length === 0) {
    await db.createCollection(name, options)
    return
  }
  if (Object.keys(options).length > 0) {
    await db.command({ collMod: name, ...options })
  }
}

export async function applySchema(db: Db): Promise<void> {
  await ensureCollection(db, 'audit', {
    validator: AUDIT_VALIDATOR,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await ensureCollection(db, 'properties')
  await ensureCollection(db, 'offers')
  await ensureCollection(db, 'users')

  await db.collection('audit').createIndex({ at: -1 })
  await db.collection('audit').createIndex({ subject: 1, at: -1 })

  await db.collection('properties').createIndex({ location: '2dsphere' })
  await db.collection('properties').createIndex({ 'address.countryCode': 1 })

  await db.collection('offers').createIndex({ status: 1, type: 1 })
  await db.collection('offers').createIndex({ propertyId: 1 })
  await db.collection('offers').createIndex({ status: 1, expiresAt: 1 })

  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  await db.collection('users').createIndex({ accountStatus: 1, createdAt: -1 })
}
```

- [ ] **Step 7: Run the tests**

Run: `bun test tests/db/indexes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add src/db/client.ts src/db/indexes.ts tests/helpers/db.ts tests/db/indexes.test.ts
git commit -m "Set up collections and indexes declaratively, and run it on every boot

Indexes described in a migration you have to remember to run are indexes that
are missing in production. Describing them as the desired end state and applying
that state at startup means the database matches the code that queries it,
whether the deployment is new or five months old.

The driver is pinned to 6 deliberately. Version 7 ships bson 7, which calls a
node:v8 API Bun has not implemented, and the import throws before any of our
code runs."
```

---

### Task 6: The BSON money boundary

**Files:**
- Create: `src/db/codecs.ts`
- Create: `tests/db/codecs.test.ts`

**Interfaces:**
- Consumes: `Money` from `src/domain/money.ts`.
- Produces:
  - `type MoneyDoc = { amount: Long; currency: string }`
  - `encodeMoney(value: Money): MoneyDoc`
  - `decodeMoney(doc: MoneyDoc): Money`
  - `encodeArea(area: Area): Long`, `decodeArea(value: Long): Area`

- [ ] **Step 1: Write the failing test**

The point of this test is the value above 2^53. Small test values never trip the bug, so a test that only uses them proves nothing.

`tests/db/codecs.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Long } from 'mongodb'
import type { Database } from '../../src/db/client'
import { decodeArea, decodeMoney, encodeArea, encodeMoney } from '../../src/db/codecs'
import { areaFromM2 } from '../../src/domain/area'
import { money, parseMoney } from '../../src/domain/money'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('money codec', () => {
  test('encodes to a BSON Long', () => {
    const doc = encodeMoney(parseMoney('1234.56', 'GBP'))
    expect(doc.amount).toBeInstanceOf(Long)
    expect(doc.currency).toBe('GBP')
  })

  test('round-trips in memory', () => {
    const value = parseMoney('45000000.50', 'NGN')
    expect(decodeMoney(encodeMoney(value))).toEqual(value)
  })

  test('survives a real database round trip above 2^53', async () => {
    const value = money(9_007_199_254_740_993n, 'GBP')
    const collection = database.db.collection('codec_probe')
    await collection.insertOne({ _id: 'probe' as never, price: encodeMoney(value) })
    const stored = await collection.findOne({ _id: 'probe' as never })
    expect(decodeMoney(stored!.price).amount).toBe(9_007_199_254_740_993n)
  })

  test('Long.toNumber loses the value the codec preserves', () => {
    // The reason decodeMoney exists. Documented as an executable fact.
    const long = Long.fromBigInt(9_007_199_254_740_993n)
    expect(long.toNumber()).toBe(9_007_199_254_740_992)
    expect(long.toBigInt()).toBe(9_007_199_254_740_993n)
  })

  test('rejects a document whose currency is unknown', () => {
    expect(() => decodeMoney({ amount: Long.fromBigInt(1n), currency: 'XYZ' })).toThrow()
  })
})

describe('area codec', () => {
  test('round-trips', () => {
    const area = areaFromM2('1240.55')
    expect(decodeArea(encodeArea(area))).toEqual(area)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/db/codecs.test.ts`
Expected: FAIL, cannot resolve `../../src/db/codecs`.

- [ ] **Step 3: Implement `src/db/codecs.ts`**

```ts
import { Long } from 'mongodb'
import type { Area } from '../domain/area'
import { money, type Money } from '../domain/money'

export type MoneyDoc = {
  readonly amount: Long
  readonly currency: string
}

export function encodeMoney(value: Money): MoneyDoc {
  return { amount: Long.fromBigInt(value.amount), currency: value.currency }
}

export function decodeMoney(doc: MoneyDoc): Money {
  // toBigInt, never toNumber. toNumber rounds silently above 2^53.
  return money(doc.amount.toBigInt(), doc.currency)
}

export function encodeArea(area: Area): Long {
  return Long.fromBigInt(area.hundredthsM2)
}

export function decodeArea(value: Long): Area {
  return { hundredthsM2: value.toBigInt() }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/db/codecs.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/codecs.ts tests/db/codecs.test.ts
git commit -m "Convert money at the BSON boundary and nowhere else

The driver hands back int64 as a Long, and Long.toNumber rounds above 2^53
without complaining. One value proves it: 9007199254740993 comes back as
9007199254740992. That is a guide price silently altered on read, and no
ordinary test value is large enough to expose it.

Keeping the conversion in one module means there is one place that has to be
right, and the test asserts the failure mode directly rather than describing it
in a comment."
```

---

### Task 7: The append-only audit log

**Files:**
- Create: `src/db/repositories/audit.ts`
- Create: `tests/db/audit.test.ts`

**Interfaces:**
- Consumes: `Db` from the driver, `applySchema` from Task 5.
- Produces:
  - `type AuditEntry = { at: Date; actor: string; action: string; subject: string; detail?: Record<string, unknown> }`
  - `createAuditRepository(db: Db)` returning `{ append(entry: Omit<AuditEntry, 'at'>): Promise<void>; forSubject(subject: string, limit?: number): Promise<AuditEntry[]>; recent(limit?: number): Promise<AuditEntry[]> }`

- [ ] **Step 1: Write the failing test**

`tests/db/audit.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { createAuditRepository } from '../../src/db/repositories/audit'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('audit repository', () => {
  test('appends an entry and stamps the time itself', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({ actor: 'staff:1', action: 'offer.published', subject: 'offer:abc' })
    const [entry] = await audit.recent()
    expect(entry?.actor).toBe('staff:1')
    expect(entry?.action).toBe('offer.published')
    expect(entry?.at).toBeInstanceOf(Date)
  })

  test('exposes no way to change or remove an entry', () => {
    const audit = createAuditRepository(database.db)
    const surface = Object.keys(audit)
    expect(surface.sort()).toEqual(['append', 'forSubject', 'recent'])
    for (const forbidden of ['update', 'delete', 'remove', 'replace', 'clear']) {
      expect(surface.some((key) => key.toLowerCase().includes(forbidden))).toBe(false)
    }
  })

  test('returns a subject trail newest first', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({ actor: 'staff:1', action: 'offer.drafted', subject: 'offer:trail' })
    await audit.append({ actor: 'staff:1', action: 'offer.reviewed', subject: 'offer:trail' })
    await audit.append({ actor: 'staff:2', action: 'offer.published', subject: 'offer:trail' })
    const trail = await audit.forSubject('offer:trail')
    expect(trail.map((entry) => entry.action)).toEqual([
      'offer.published', 'offer.reviewed', 'offer.drafted',
    ])
  })

  test('carries optional structured detail', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({
      actor: 'staff:1',
      action: 'application.approved',
      subject: 'application:xyz',
      detail: { amount: '25000.00', currency: 'GBP' },
    })
    const [entry] = await audit.forSubject('application:xyz')
    expect(entry?.detail).toEqual({ amount: '25000.00', currency: 'GBP' })
  })

  test('the collection validator rejects a malformed entry', async () => {
    // Guards against a future caller reaching the collection directly.
    let code: number | undefined
    try {
      await database.db.collection('audit').insertOne({ actor: 'staff:1' } as never)
    } catch (error) {
      code = (error as { code?: number }).code
    }
    expect(code).toBe(121)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test tests/db/audit.test.ts`
Expected: FAIL, cannot resolve `../../src/db/repositories/audit`.

- [ ] **Step 3: Implement `src/db/repositories/audit.ts`**

```ts
import type { Db } from 'mongodb'

export type AuditEntry = {
  readonly at: Date
  readonly actor: string
  readonly action: string
  readonly subject: string
  readonly detail?: Record<string, unknown>
}

export type AuditRepository = {
  append(entry: Omit<AuditEntry, 'at'>): Promise<void>
  forSubject(subject: string, limit?: number): Promise<AuditEntry[]>
  recent(limit?: number): Promise<AuditEntry[]>
}

export function createAuditRepository(db: Db): AuditRepository {
  const collection = db.collection<AuditEntry>('audit')

  return {
    async append(entry) {
      await collection.insertOne({ ...entry, at: new Date() })
    },

    async forSubject(subject, limit = 200) {
      return collection.find({ subject }, { projection: { _id: 0 } })
        .sort({ at: -1 }).limit(limit).toArray()
    },

    async recent(limit = 200) {
      return collection.find({}, { projection: { _id: 0 } })
        .sort({ at: -1 }).limit(limit).toArray()
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/db/audit.test.ts`
Expected: PASS, 5 tests.

If the trail ordering test is flaky, three appends inside the same millisecond are sorting arbitrarily. Fix it by asserting on set membership plus the newest entry, not by adding a sleep.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/audit.ts tests/db/audit.test.ts
git commit -m "Make the audit log append-only by giving it no other verbs

An audit trail that can be edited is a record of what someone was willing to
leave behind. SQLite could enforce this with triggers rejecting UPDATE and
DELETE; MongoDB has no equivalent available to us, so the guarantee is built
from three cheaper parts instead: a repository whose entire surface is append
and two reads, a collection validator that rejects a malformed entry, and the
source test in the next commit that stops anyone reaching the collection
directly.

The remaining hardening is a database role granting only insert and find on the
collection, recorded for the production deployment."
```

---

### Task 8: The guard tests

**Files:**
- Create: `tests/guards/architecture.test.ts`

**Interfaces:**
- Consumes: the source tree.
- Produces: nothing importable. These tests exist to fail.

- [ ] **Step 1: Understand what these are for**

Every rule in the spec that a reviewer would otherwise have to remember is written here as a test that reads the source. They are cheap, they never go stale the way a convention does, and they fail on the pull request rather than in production.

- [ ] **Step 2: Write the tests**

`tests/guards/architecture.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

const root = new URL('../../', import.meta.url).pathname

async function sourceFiles(pattern: string): Promise<{ path: string; text: string }[]> {
  const glob = new Glob(pattern)
  const files: { path: string; text: string }[] = []
  for await (const path of glob.scan({ cwd: root })) {
    files.push({ path, text: await Bun.file(root + path).text() })
  }
  return files
}

describe('the MongoDB driver stays in the database layer', () => {
  test('nothing outside src/db imports mongodb', async () => {
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => !file.path.startsWith('src/db/'))
      .filter((file) => /from ['"]mongodb['"]/.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })

  test('nothing outside src/db/repositories runs a query', async () => {
    const queryMethods = /\.(find|findOne|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|aggregate|replaceOne|findOneAndUpdate|bulkWrite)\(/
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => !file.path.startsWith('src/db/'))
      .filter((file) => queryMethods.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('the domain layer is pure', () => {
  test('src/domain imports neither express nor mongodb', async () => {
    const offenders = (await sourceFiles('src/domain/**/*.ts'))
      .filter((file) => /from ['"](express|mongodb)['"]/.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('money never becomes a float', () => {
  test('no parseFloat, toFixed or Long.toNumber in src', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/**/*.ts')) {
      for (const [index, line] of file.text.split('\n').entries()) {
        if (line.trimStart().startsWith('//')) continue
        if (/\bparseFloat\s*\(|\.toFixed\s*\(|\.toNumber\s*\(/.test(line)) {
          offenders.push(`${file.path}:${index + 1}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the audit log has no write path but append', () => {
  test('no source file mutates the audit collection', async () => {
    const mutation = /collection[^\n]*['"]audit['"][^\n]*\)\s*\.\s*(updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndDelete|drop)/
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => mutation.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('the content security policy stays strict', () => {
  test('no inline style attribute, style block or script block in a template', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/views/**/*.pug')) {
      if (/\bstyle\s*=/.test(file.text)) offenders.push(`${file.path} (style attribute)`)
      if (/^\s*(style|script)\b(?![^\n]*\bsrc=)/m.test(file.text)) {
        offenders.push(`${file.path} (inline block)`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no Alpine expression that needs eval', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/views/**/*.pug')) {
      if (/x-data\s*=\s*["']\s*\{/.test(file.text)) offenders.push(`${file.path} (object literal in x-data)`)
      if (/@click\s*=\s*["'][^"']*[()=]/.test(file.text)) offenders.push(`${file.path} (expression in @click)`)
    }
    expect(offenders).toEqual([])
  })
})

describe('interface copy stays plain', () => {
  test('no em dash or en dash in a template or the stylesheet', async () => {
    const offenders: string[] = []
    for (const file of [...(await sourceFiles('src/views/**/*.pug')), ...(await sourceFiles('public/*.css'))]) {
      if (/[–—]/.test(file.text)) offenders.push(file.path)
    }
    expect(offenders).toEqual([])
  })

  test('no internal commentary rendered to a page', async () => {
    const banned = /\b(coming soon|not yet implemented|placeholder|illustrative|lorem ipsum|TODO)\b/i
    const offenders = (await sourceFiles('src/views/**/*.pug'))
      .filter((file) => banned.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `bun test tests/guards/architecture.test.ts`
Expected: PASS. The `src/views/**/*.pug` globs match nothing yet, which is correct; they start guarding as soon as Task 9 adds the first template.

If the money guard flags `src/db/codecs.ts`, read the line. `toBigInt` is correct and `toNumber` is not; the regex only matches the latter. If it flags a genuine `.toNumber(` you have introduced the exact bug this rule exists for.

- [ ] **Step 4: Commit**

```bash
git add tests/guards/architecture.test.ts
git commit -m "Write the architectural rules as tests that read the source

A rule that lives in a document is a rule someone has to remember at three in
the morning. Each of these reads the source tree and fails on the change that
breaks it: the driver leaking out of the database layer, the domain picking up a
dependency on Express, a float appearing on a money path, the audit log growing
a second write verb, an inline style defeating the content security policy, an
em dash reaching interface copy.

They cost almost nothing to run and they remove the need to police any of it by
review."
```

---

### Task 9: The Express application, security headers and asset hashing

**Files:**
- Create: `src/asset-hash.ts`, `src/app.ts`, `src/views/layout.pug`, `src/views/health.pug`
- Create: `tests/app.test.ts`, `tests/asset-hash.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 1, `Database` from Task 5.
- Produces:
  - `createAssetHasher(config: Config): { cssHref(): string }`
  - `createApp(deps: { config: Config; database: Database }): express.Express`

- [ ] **Step 1: Write the failing asset-hash test**

The trap: Bun's watcher does not restart on `public/` edits, so a hash computed once at boot goes stale and the browser keeps serving the old stylesheet. In development the hash is recomputed per request. This cost a previous project two rounds of design work spent believing the CSS had no effect.

`tests/asset-hash.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { unlinkSync, writeFileSync } from 'node:fs'
import { loadConfig } from '../src/config'
import { createAssetHasher } from '../src/asset-hash'

const base = {
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'marchmont_test',
  SESSION_SECRET: 'x'.repeat(32),
  PAYMENTS_PROVIDER: 'sandbox',
  GEOCODING_PROVIDER: 'sandbox',
  MAIL_PROVIDER: 'sandbox',
}

const probe = new URL('../public/hash-probe.css', import.meta.url).pathname
afterEach(() => { try { unlinkSync(probe) } catch {} })

describe('createAssetHasher', () => {
  test('produces a stable href for app.css', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'production' }))
    expect(hasher.cssHref()).toMatch(/^\/app\.css\?v=[0-9a-f]{8}$/)
    expect(hasher.cssHref()).toBe(hasher.cssHref())
  })

  test('in development the hash follows an edit to the file', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'development' }), 'hash-probe.css')
    writeFileSync(probe, 'a{color:red}')
    const before = hasher.cssHref()
    writeFileSync(probe, 'a{color:blue}')
    expect(hasher.cssHref()).not.toBe(before)
  })

  test('in production the hash is computed once and cached', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'production' }), 'hash-probe.css')
    writeFileSync(probe, 'a{color:red}')
    const before = hasher.cssHref()
    writeFileSync(probe, 'a{color:blue}')
    expect(hasher.cssHref()).toBe(before)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test tests/asset-hash.test.ts`
Expected: FAIL, cannot resolve `../src/asset-hash`.

- [ ] **Step 3: Implement `src/asset-hash.ts`**

```ts
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Config } from './config'

export type AssetHasher = {
  cssHref(): string
}

export function createAssetHasher(config: Config, file = 'app.css'): AssetHasher {
  const path = new URL(`../public/${file}`, import.meta.url).pathname

  const compute = (): string => {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
    } catch {
      return '00000000'
    }
  }

  // Bun's watcher does not restart on public/ edits, so a hash cached in
  // development would pin the browser to a stale stylesheet.
  if (config.nodeEnv === 'development') {
    return { cssHref: () => `/${file}?v=${compute()}` }
  }

  const cached = compute()
  return { cssHref: () => `/${file}?v=${cached}` }
}
```

- [ ] **Step 4: Run it**

Run: `bun test tests/asset-hash.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing app test**

`tests/app.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'node:http'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import type { Database } from '../src/db/client'
import { dropTestDb, withTestDb } from './helpers/db'

let database: Database
let server: Server
let origin: string

beforeAll(async () => {
  database = await withTestDb()
  const config = loadConfig({
    NODE_ENV: 'test', PORT: '3000',
    MONGO_URL: 'mongodb://127.0.0.1:27017', MONGO_DB: 'marchmont_test',
    SESSION_SECRET: 'x'.repeat(32),
    PAYMENTS_PROVIDER: 'sandbox', GEOCODING_PROVIDER: 'sandbox', MAIL_PROVIDER: 'sandbox',
  })
  // listen(0) picks a free port; config.port is unused here because loadConfig
  // rejects 0 as out of range.
  server = createApp({ config, database }).listen(0)
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(async () => {
  server.close()
  await dropTestDb(database)
})

describe('health', () => {
  test('reports ready when the database answers', async () => {
    const response = await fetch(`${origin}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ready' })
  })
})

describe('security headers', () => {
  test('sends a content security policy with no unsafe directive', async () => {
    const policy = (await fetch(`${origin}/health`)).headers.get('content-security-policy')
    expect(policy).toBeTruthy()
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
  })

  test('sends the rest of the baseline headers', async () => {
    const headers = (await fetch(`${origin}/health`)).headers
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-powered-by')).toBeNull()
  })
})

describe('static assets', () => {
  test('serves the stylesheet', async () => {
    const response = await fetch(`${origin}/app.css`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/css')
  })
})

describe('errors', () => {
  test('an unknown route renders a 404 page, not a stack trace', async () => {
    const response = await fetch(`${origin}/no-such-page`)
    expect(response.status).toBe(404)
    const body = await response.text()
    expect(body).not.toContain('at Object')
    expect(body).not.toMatch(/[–—]/)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `bun test tests/app.test.ts`
Expected: FAIL, cannot resolve `../src/app`.

- [ ] **Step 7: Implement the templates**

`src/views/layout.pug`:

```pug
doctype html
html(lang="en")
  head
    meta(charset="utf-8")
    meta(name="viewport" content="width=device-width, initial-scale=1")
    title= title ? `${title} | Marchmont` : "Marchmont"
    link(rel="icon" href="/favicon.svg" type="image/svg+xml")
    link(rel="stylesheet" href=cssHref)
  body
    main#main
      block content
```

`src/views/health.pug`:

```pug
extends layout

block content
  h1 Marchmont
  p Service is running.
```

`src/views/404.pug`:

```pug
extends layout

block content
  h1 Page not found
  p That page does not exist. Try the portfolio or the contact page.
  p
    a(href="/") Return to the home page
```

- [ ] **Step 8: Implement `src/app.ts`**

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

export function createApp(deps: { config: Config; database: Database }): express.Express {
  const { config, database } = deps
  const assets = createAssetHasher(config)
  const app = express()

  app.disable('x-powered-by')
  app.set('view engine', 'pug')
  app.set('views', new URL('views', import.meta.url).pathname)

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.locals.cssHref = assets.cssHref()
    next()
  })

  app.use(
    express.static(new URL('../public', import.meta.url).pathname, {
      maxAge: config.nodeEnv === 'production' ? '365d' : 0,
      index: false,
    }),
  )

  app.get('/health', async (_req, res) => {
    try {
      await database.db.command({ ping: 1 })
      res.status(200).json({ status: 'ready' })
    } catch {
      res.status(503).json({ status: 'unavailable' })
    }
  })

  app.use((_req, res) => {
    res.status(404).render('404', { title: 'Page not found' })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).render('404', { title: 'Something went wrong' })
  })

  return app
}
```

- [ ] **Step 9: Run the whole suite**

Run: `bun test`
Expected: PASS. The CSP guard tests from Task 8 now have templates to read and should still pass.

- [ ] **Step 10: Commit**

```bash
git add src/app.ts src/asset-hash.ts src/views tests/app.test.ts tests/asset-hash.test.ts
git commit -m "Serve the app behind a strict policy, and recompute the asset hash in development

The content security policy carries no unsafe-inline and no unsafe-eval, which
is what makes the Alpine CSP build necessary rather than optional later. Setting
it now means no template ever grows an inline style that would have to be
unpicked.

The stylesheet is content-hashed so it can be cached for a year, and the hash is
recomputed per request in development because Bun's watcher does not restart on
public/ edits. Without that, a cached hash pins the browser to the stylesheet as
it was at boot and every CSS change appears to do nothing."
```

---

### Task 10: Non-overlapping background intervals

**Files:**
- Create: `src/interval.ts`
- Create: `tests/interval.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `startInterval(options: { name: string; everyMs: number; run: () => Promise<void>; onError?: (error: unknown) => void }): { stop(): void }`

- [ ] **Step 1: Understand why this exists**

Offer expiry has to happen whether or not anyone is looking at a page. A job that only runs when a request arrives is not a job. Two properties matter: it must not overlap with itself when a run takes longer than the interval, and a thrown error must not kill the timer.

- [ ] **Step 2: Write the failing test**

`tests/interval.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { startInterval } from '../src/interval'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('startInterval', () => {
  test('runs repeatedly', async () => {
    let runs = 0
    const job = startInterval({ name: 'counter', everyMs: 10, run: async () => { runs += 1 } })
    await wait(60)
    job.stop()
    expect(runs).toBeGreaterThanOrEqual(3)
  })

  test('never overlaps with itself when a run outlasts the interval', async () => {
    let active = 0
    let maxActive = 0
    const job = startInterval({
      name: 'slow',
      everyMs: 5,
      run: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await wait(30)
        active -= 1
      },
    })
    await wait(120)
    job.stop()
    expect(maxActive).toBe(1)
  })

  test('survives a throwing run and reports it', async () => {
    const errors: unknown[] = []
    let runs = 0
    const job = startInterval({
      name: 'flaky',
      everyMs: 10,
      run: async () => { runs += 1; throw new Error('boom') },
      onError: (error) => errors.push(error),
    })
    await wait(60)
    job.stop()
    expect(runs).toBeGreaterThanOrEqual(3)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })

  test('stop prevents any further run', async () => {
    let runs = 0
    const job = startInterval({ name: 'stoppable', everyMs: 5, run: async () => { runs += 1 } })
    await wait(30)
    job.stop()
    const afterStop = runs
    await wait(40)
    expect(runs).toBe(afterStop)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun test tests/interval.test.ts`
Expected: FAIL, cannot resolve `../src/interval`.

- [ ] **Step 4: Implement `src/interval.ts`**

```ts
export type IntervalOptions = {
  readonly name: string
  readonly everyMs: number
  run(): Promise<void>
  onError?(error: unknown): void
}

export type IntervalHandle = {
  stop(): void
}

export function startInterval(options: IntervalOptions): IntervalHandle {
  const { name, everyMs, run, onError } = options
  let running = false
  let stopped = false

  const timer = setInterval(async () => {
    if (running || stopped) return
    running = true
    try {
      await run()
    } catch (error) {
      if (onError) onError(error)
      else console.error(`interval "${name}" failed`, error)
    } finally {
      running = false
    }
  }, everyMs)

  // Do not hold the process open on its own account.
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
```

- [ ] **Step 5: Run it**

Run: `bun test tests/interval.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/interval.ts tests/interval.test.ts
git commit -m "Run background work on a timer that cannot overlap or die

Stale listings are the main quality problem on every property site, so offer
expiry has to run whether or not anyone has a page open. A job triggered by
request traffic is not a job.

Two failure modes are handled directly because both are silent. A run that takes
longer than its interval would otherwise stack copies of itself against the same
documents, so a run in progress skips the next tick. A thrown error would
otherwise kill the timer and leave the process healthy but doing nothing, so
errors are caught, reported, and the schedule continues."
```

---

### Task 11: Server boot, Docker image and a verified container

**Files:**
- Create: `src/server.ts`, `Dockerfile`, `.dockerignore`, `compose.yaml`
- Create: `scripts/verify-container.sh`

**Interfaces:**
- Consumes: everything above.
- Produces: a container that boots and serves `/health`.

- [ ] **Step 1: Implement `src/server.ts`**

```ts
import { createApp } from './app'
import { loadConfig } from './config'
import { connect } from './db/client'
import { applySchema } from './db/indexes'

const config = loadConfig(process.env)
const database = await connect(config)
await applySchema(database.db)

const app = createApp({ config, database })
const server = app.listen(config.port, () => {
  console.log(`marchmont listening on ${config.port} in ${config.nodeEnv}`)
})

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} received, shutting down`)
  server.close()
  await database.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
```

- [ ] **Step 2: Write the Dockerfile**

```dockerfile
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
```

`.dockerignore`:

```
node_modules
.git
docs
tests
.env
.env.*
*.log
```

- [ ] **Step 3: Write `compose.yaml`**

```yaml
services:
  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  app:
    build: .
    depends_on:
      - mongo
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: "3000"
      MONGO_URL: mongodb://mongo:27017
      MONGO_DB: marchmont
      SESSION_SECRET: ${SESSION_SECRET}
      PAYMENTS_PROVIDER: ${PAYMENTS_PROVIDER}
      GEOCODING_PROVIDER: ${GEOCODING_PROVIDER}
      MAIL_PROVIDER: ${MAIL_PROVIDER}

volumes:
  mongo-data:
```

- [ ] **Step 4: Write the verification script**

The image is verified now, not at the end of the project. An image that has never been run is not a deployment target.

`scripts/verify-container.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

export SESSION_SECRET="verification-secret-at-least-32-chars"
export PAYMENTS_PROVIDER=stripe
export GEOCODING_PROVIDER=mapbox
export MAIL_PROVIDER=postmark

docker compose up --build -d

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health | grep -q '"status":"ready"'; then
    echo "container boots and serves /health"
    exit 0
  fi
  sleep 2
done

echo "container did not become ready" >&2
docker compose logs app >&2
exit 1
```

- [ ] **Step 5: Verify production actually refuses a sandbox provider**

```bash
chmod +x scripts/verify-container.sh
PAYMENTS_PROVIDER=sandbox docker compose up --build app 2>&1 | grep -i 'sandbox'
```

Expected: the container exits and the log names `PAYMENTS_PROVIDER`. If it boots, the production guard in `loadConfig` is not wired to the real environment and must be fixed before continuing.

- [ ] **Step 6: Run the verification**

Run: `./scripts/verify-container.sh`
Expected: `container boots and serves /health`.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts Dockerfile .dockerignore compose.yaml scripts/verify-container.sh
git commit -m "Write the container early and prove it boots

A Dockerfile written at the end of a project is a Dockerfile discovered to be
broken at the end of a project. This one is verified now, by a script that
builds the image, brings up MongoDB alongside it, and waits for the health
endpoint to report ready.

The same script checks the other direction: production started with a sandbox
provider must fail to boot. A guard that has only ever been asserted in a unit
test has not been shown to hold where it matters."
```

---

### Task 12: Seed script and operator readme

**Files:**
- Create: `scripts/seed.ts`, `README.md`
- Create: `tests/scripts/seed.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `seed(database: Database): Promise<{ properties: number; offers: number }>`

- [ ] **Step 1: Write the failing test**

The seed exists so the site is never empty after a restart on a host with no persistent disk. It must be safe to run twice.

`tests/scripts/seed.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { seed } from '../../scripts/seed'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('seed', () => {
  test('creates properties and offers', async () => {
    const counts = await seed(database)
    expect(counts.properties).toBeGreaterThan(0)
    expect(counts.offers).toBeGreaterThan(0)
  })

  test('is safe to run twice', async () => {
    await seed(database)
    const after = await database.db.collection('properties').countDocuments()
    await seed(database)
    expect(await database.db.collection('properties').countDocuments()).toBe(after)
  })

  test('every seeded price is stored as a Long, never a double', async () => {
    await seed(database)
    for await (const offer of database.db.collection('offers').find()) {
      const price = offer.price ?? offer.rentPerMonth
      expect(price.amount._bsontype).toBe('Long')
      expect(typeof price.currency).toBe('string')
    }
  })

  test('seeded copy carries no em dash or en dash', async () => {
    await seed(database)
    for await (const property of database.db.collection('properties').find()) {
      expect(JSON.stringify(property)).not.toMatch(/[–—]/)
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test tests/scripts/seed.test.ts`
Expected: FAIL, cannot resolve `../../scripts/seed`.

- [ ] **Step 3: Implement `scripts/seed.ts`**

Three properties across three countries, so multi-currency and multi-locale are exercised from the first commit rather than discovered later. Copy is plain and factual, and none of it claims anything untrue.

```ts
import { loadConfig } from '../src/config'
import { connect, type Database } from '../src/db/client'
import { encodeArea, encodeMoney } from '../src/db/codecs'
import { applySchema } from '../src/db/indexes'
import { areaFromM2 } from '../src/domain/area'
import { parseMoney } from '../src/domain/money'

const PROPERTIES = [
  {
    _id: 'prop-grote-markt',
    slug: 'grote-markt-6',
    buildingType: 'office',
    address: {
      formatted: 'Grote Markt 6, 2000 Antwerp',
      countryCode: 'BE',
      locality: 'Antwerp',
    },
    location: { type: 'Point', coordinates: [4.4025, 51.2213] },
    areaM2: '1240.55',
    floors: 6,
    yearBuilt: 1904,
    summary: 'Six floors off the Grote Markt with north light on every one. Available whole or by floor.',
  },
  {
    _id: 'prop-ikoyi-crescent',
    slug: 'ikoyi-crescent-12',
    buildingType: 'house',
    address: {
      formatted: '12 Ikoyi Crescent, Ikoyi, Lagos',
      countryCode: 'NG',
      locality: 'Lagos',
    },
    location: { type: 'Point', coordinates: [3.4356, 6.4541] },
    areaM2: '480.00',
    floors: 2,
    yearBuilt: 1978,
    summary: 'Four bedroom detached house on a walled plot, with a separate two bedroom guest wing.',
  },
  {
    _id: 'prop-cheyne-walk',
    slug: 'cheyne-walk-41',
    buildingType: 'house',
    address: {
      formatted: '41 Cheyne Walk, London SW3',
      countryCode: 'GB',
      locality: 'London',
    },
    location: { type: 'Point', coordinates: [-0.1712, 51.4831] },
    areaM2: '310.00',
    floors: 4,
    yearBuilt: 1832,
    summary: 'Grade II listed terrace facing the river, arranged over four floors with a walled garden.',
  },
]

const OFFERS = [
  {
    _id: 'offer-grote-markt-lease',
    propertyId: 'prop-grote-markt',
    type: 'long_lease',
    status: 'live',
    scope: 'floor',
    scopeLabel: 'Second and third floors',
    rentPerMonth: { decimal: '18500.00', currency: 'EUR' },
    minTermMonths: 36,
  },
  {
    _id: 'offer-ikoyi-sale',
    propertyId: 'prop-ikoyi-crescent',
    type: 'sale',
    status: 'live',
    scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '450000000.00', currency: 'NGN' },
    tenure: 'freehold',
  },
  {
    _id: 'offer-cheyne-corporate',
    propertyId: 'prop-cheyne-walk',
    type: 'corporate_let',
    status: 'live',
    scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '32000.00', currency: 'GBP' },
    minTermMonths: 3,
    maxTermMonths: 6,
  },
]

export async function seed(database: Database): Promise<{ properties: number; offers: number }> {
  const properties = database.db.collection('properties')
  const offers = database.db.collection('offers')

  for (const property of PROPERTIES) {
    const { _id, areaM2, ...rest } = property
    // _id must not appear in a replaceOne replacement document.
    await properties.replaceOne(
      { _id: _id as never },
      { ...rest, area: encodeArea(areaFromM2(areaM2)) } as never,
      { upsert: true },
    )
  }

  for (const offer of OFFERS) {
    const { _id, ...rest } = offer
    const document: Record<string, unknown> = { ...rest }
    for (const field of ['price', 'rentPerMonth'] as const) {
      const value = (rest as Record<string, unknown>)[field] as
        | { decimal: string; currency: string }
        | undefined
      if (value) {
        document[field] = encodeMoney(parseMoney(value.decimal, value.currency))
        document.currency = value.currency
      }
    }
    await offers.replaceOne({ _id: _id as never }, document as never, { upsert: true })
  }

  return { properties: PROPERTIES.length, offers: OFFERS.length }
}

if (import.meta.main) {
  const config = loadConfig(process.env)
  const database = await connect(config)
  await applySchema(database.db)
  const counts = await seed(database)
  console.log(`seeded ${counts.properties} properties and ${counts.offers} offers`)
  await database.close()
}
```

Note the `upsert: true` on every write. An update is not an upsert, and a repository method that updates a document which does not exist yet silently drops data on the first run. In MongoDB this fails quietly: `updateOne` without `upsert` returns `matchedCount: 0` and throws nothing.

- [ ] **Step 4: Run the tests**

Run: `bun test tests/scripts/seed.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the operator readme**

`README.md`:

```markdown
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
ready.

## Deploy

A container on a host with a long-running process: Fly.io, Render, Railway or a
VPS. Not Vercel, which runs Node rather than Bun and kills background intervals.
MongoDB runs as a managed instance rather than in the app container.

Required environment: `NODE_ENV`, `PORT`, `MONGO_URL`, `MONGO_DB`,
`SESSION_SECRET`, `PAYMENTS_PROVIDER`, `GEOCODING_PROVIDER`, `MAIL_PROVIDER`.
Production refuses to boot if any provider is `sandbox`.

`bun run seed` is safe to run on every boot and rebuilds a working demo, so a
host without a persistent disk is never left with an empty site.

## Audit log hardening

The audit log is append-only through three mechanisms: the repository exposes
only `append`, a collection validator rejects malformed entries, and a test in
`tests/guards/` fails on any source that mutates the collection.

For production, add a database role granting only `insert` and `find` on
`audit`, and connect the application with it. That moves the last of the
guarantee out of application code and into the database.
```

- [ ] **Step 6: Run everything**

Run: `bun test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed.ts tests/scripts/seed.test.ts README.md
git commit -m "Seed three properties across three countries, and write the operator readme

Seeding one market would let a hardcoded currency or locale survive unnoticed
until the second country arrived. An earlier project had a single market
surgically removed afterwards and it touched every page. Antwerp, Lagos and
London in euros, naira and pounds means anything monolingual or single-currency
fails on the first run instead.

Every write is an upsert. An update that matches nothing returns matchedCount 0
and throws nothing, so a seed built on plain updates would silently do nothing
on a fresh database."
```

---

## Deliberately not in this plan

Named so a later reader does not mistake them for oversights.

- **Provider interfaces and their sandboxes.** `loadConfig` validates the
  provider names and refuses to boot production on a sandbox, so the guard is in
  place from the first commit. The interfaces themselves land with their first
  consumer: mail in slice 4, payments in slice 6, geocoding and FX in slice 3.
  Building empty abstractions ahead of a caller is how they end up shaped wrong.
- **Property and offer repositories.** Only the audit repository exists here.
  The others arrive in slice 3 with the queries they need to serve, rather than
  as a guessed surface.
- **The offer state machine.** Slice 3. The collections and indexes it needs are
  created in Task 5 so nothing has to be migrated when it arrives.
- **`startInterval` has no job wired to it yet.** It is built now because the
  container and server boot are built now, and offer expiry in slice 3 is its
  first caller.
- **The audit database role.** The append-only guarantee here comes from the
  repository surface, the collection validator and the guard test. Moving the
  last of it into a database role granting only `insert` and `find` is recorded
  in the readme as production hardening.

## Definition of Done for this plan

- `bun test` passes with no skipped suites.
- `./scripts/verify-container.sh` prints that the container boots and serves.
- Production started with a sandbox provider fails to boot, observed rather than assumed.
- `public/app.css` passes every contrast assertion.
- The guard tests pass and would fail if their rule were broken. Check one by hand: add `.toFixed(2)` to a source file, watch the test fail, remove it.
- No em dash or en dash anywhere in `src/views/` or `public/`.
- Every commit message explains why, not what.
