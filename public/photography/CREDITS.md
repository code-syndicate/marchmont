# Photography

Every photograph the site serves lives in this directory, at three widths each
(800, 1600, 2400). Nothing is fetched from anyone else's CDN at request time, so
a listing keeps its pictures whether or not the original is still published, and
the content security policy needs no external image origin.

Refresh or extend the set with:

    bun scripts/fetch-photography.ts

It skips anything already present, so it is safe to run repeatedly.

## Source and licence

The `villa-*` photographs were supplied by the owner in September 2026 and are
not from Unsplash. They are 960 pixels wide at source, so the 1600 and 2400
files are the source size, not an enlargement. `scripts/fetch-photography.ts`
ignores them. A house number and a builder's sign were painted out of
`villa-front-gate` and `villa-street-facade`.

Everything with a `photo-*` id was sourced from Unsplash under the Unsplash License, which permits download and
use for commercial and non-commercial purposes without permission. Attribution
is not required by the licence and is recorded here anyway.

These are photographs of comparable buildings, not of the buildings in the
portfolio, which are not real. `scripts/seed.ts` tags each one with what it
shows so a listing leads with the right kind of picture.

## Use tags

| Tag | Shows | Leads on |
|---|---|---|
| `exterior` | The building from outside | Any whole building offer |
| `office` | Office floors, fitted or bare | Office and mixed buildings to let or for sale |
| `residence` | Loft interiors as somewhere to live | Residential sales, and lettings in a house |
| `serviced` | Furnished enough to move into | Corporate lets |
| `detail` | Fabric, stairs, light | Never a cover; fills out a gallery |
