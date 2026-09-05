# Nash Luxury Realty: identity

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

## Mark and wordmark

The mark is an N read as an elevation: two piers and the span between them,
monoline, square ended, no radius. The diagonal is drawn 8.24 units wide against
6 unit piers, because a horizontal band on a slope carries less perpendicular
weight than its width suggests; equal numbers would look wrong. An oxblood rule
sits under it, the one place the accent appears in the identity.

The wordmark is `NASH` in Fraunces at `0.18em`, with `LUXURY REALTY` beneath it
in Inter at `0.26em` in `--text-faint`. The two-line lockup keeps the mark and
the name close to square rather than running eighteen letterspaced characters
across a masthead.

Assets in `public/brand/`:

| File | Use |
|---|---|
| `mark.svg` | Mark knocked out of a `--text` square. App icons, anywhere needing a container |
| `mark-light.svg` | Mark alone, for light ground |
| `mark-tight.svg` | Mark cropped to its ink, for placing against type |
| `lockup.svg` | Mark and wordmark, dark on light |
| `lockup-dark.svg` | Mark and wordmark, light on dark |
| `og-default.png` | 1200x630 share card, used when a page has no photograph of its own |

`public/favicon.svg` is `mark.svg`, and `public/apple-touch-icon.png` is it at
180px. Colours throughout are the hex equivalents of `--ground`, `--text` and
`--accent`: `#f7f5f2`, `#201b18`, `#872926`.

A property page shares its own cover photograph; every other page shares the
card. Photography is the product, so a building speaks for itself where there
is one.

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
