# Slice 3: portfolio search, filters, sort, locator, gate 1

Status: built.

## What this slice covers

Spec section 6, item 3: seeded data, search, filters, sort, the offer detail
page with the gallery and a map, and the unregistered / approved split from
gate 1.

## Decisions

### Price filtering is pinned to one currency

The portfolio quotes in five currencies. A single price range across all of
them needs a rate, and section 3 makes FX indicative and non-blocking. Filtering
on an indicative rate means a listing drops in and out of a result set as the
rate moves, which is not a result a person can act on.

So the price range and the price sort exist only once a query pins one
currency. Bounds are that currency's own minor units, compared as `bigint`.
Area sorts globally because area is one canonical integer, and year sorts
globally because a year means the same thing everywhere.

`parseSearch` drops a price range that arrives without a currency, and
`OfferRepository.live` throws `CurrencylessPriceRange` if one reaches it
anyway, so the rule holds at both ends.

### The facet set is constrained by fair housing

Every facet describes the building or the terms of the offer: tenure type,
city, building type, scope, area, bedrooms, tenure, furnishing, term length,
availability date, and currency-pinned price. Nothing describes who lives
nearby, and free text searches the building, its city and its description
only. A facet that does not exist cannot be used to discriminate, so the
constraint is enforced by absence rather than by a rule someone has to read.

### Ordering happens after the join, not in the driver

Area and year live on the property, price lives on the offer, and price is a
`bigint` of minor units that must never be compared as a float. Sorting in the
driver would need either a denormalised copy of the property fields or a
`$lookup`. It runs in the service instead, over the joined pairs. Every key
carries a slug tiebreak, because several offers can sit in one building and
share its area and year.

### Text search is a property-side index

One text index per collection is the server limit, and the searchable prose
lives on the property. `PropertyRepository.matching` returns building ids,
which intersect with the offer query through the `buildingIds` field that was
already on `OfferQuery`. An empty match is carried through as an empty result
rather than as an absent filter.

### The map is a provider, not a client library

`script-src` is `'self'` and stays that way. A locator is an image: the `osm`
provider names the tile host, which is then the only thing added to `img-src`,
exactly as the photography provider works; the sandbox draws a schematic from
the coordinates and needs no network at all. Neither loads client script.

A locator never resolves the exact building for a viewer who has not been
approved. The coordinate is rounded to roughly a kilometre before it reaches
the URL, so the address is not recoverable from the request even though the
page does not print it.

### Gate 1 is a seam, and one flag is deliberately still open

Accounts are slice 4, so nothing can yet make a viewer approved.
`res.locals.viewer` is resolved by one function that today always returns
anonymous; slice 4 replaces that line and nothing downstream moves.

Withheld now: the exact street address, which becomes the district and city;
the full gallery, which becomes the first three photographs; and the precise
map pin.

Not withheld yet: the precise figure. The spec puts it behind gate 1, but
until a registration can actually be approved there is no route from a band
back to the number, and a price no visitor can ever reach is worse than no
gate. `PRICE_REQUIRES_APPROVAL` in `src/domain/viewer.ts` is the single edit
that closes it once slice 4 lands.

## Not in this slice

Floor plans and documents. Gate 1 releases them on approval, but none exist on
any record yet, so nothing renders an empty section promising them. The copy
says what approval releases without claiming the material is sitting there.

## Verified

- Every filter, sort and combination rendered against a running server; result
  counts and orderings checked against the database rather than the page.
- A value the portfolio does not hold returns 404 rather than a silent reset.
- Gate 1 checked on the rendered page: district not street, three photographs
  of four, blurred coordinate in the map URL.
- Both photography providers and both map providers booted; CSP admits exactly
  the active hosts and `script-src` stays `'self'`.
- No horizontal overflow across 11 pages at 360, 480, 720, 960, 1200, 1440.
- Zero axe violations across 11 pages.
