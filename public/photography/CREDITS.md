# Photography

Every photograph the site serves lives in this directory, at three widths each
(800, 1600, 2400). Nothing is fetched from anyone else's CDN at request time, and
the content security policy needs no external image origin.

## Source

All photographs are the owner's own, supplied in September 2026. They are 960
pixels wide at source, so the 1600 and 2400 files are the source size, not an
enlargement. A house number and a builder's sign were painted out of
`villa-front-gate` and `villa-street-facade`.

To add one, write `<id>-800.jpg`, `<id>-1600.jpg` and `<id>-2400.jpg` here and
reference the id from `scripts/seed.ts` or a route.

## Use tags

`scripts/seed.ts` tags each photograph with what it shows so a listing leads
with the right kind of picture.

| Tag | Shows | Leads on |
|---|---|---|
| `exterior` | The house from outside | A sale |
| `residence` | Living rooms and bedrooms | A long lease |
| `serviced` | Furnished rooms ready to move into | A corporate let |
| `office` | Office floors | Office buildings to let or for sale |
| `detail` | Bathrooms, dressing rooms, gyms | Never a cover; fills out a gallery |
