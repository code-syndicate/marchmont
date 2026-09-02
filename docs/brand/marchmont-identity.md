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

## Wordmark

Typographic. `MARCHMONT` set in Fraunces, letterspaced `0.18em`, in `--text` on
`--ground`. There is no logotype beyond that, which suits a house that does not
advertise. The only drawn element is the favicon in `public/favicon.svg`, whose
three colours are the hex equivalents of `--ground`, `--text` and `--accent`.

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
