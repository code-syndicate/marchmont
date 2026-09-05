import { describe, expect, test } from 'bun:test'
import { isNarrowed, parseMajorUnits, parseSearch, toQueryString, type Facets } from '../../src/domain/search'

const facets: Facets = { cities: ['Amsterdam', 'London', 'New York'], currencies: ['EUR', 'GBP', 'USD'] }

describe('parseMajorUnits', () => {
  test('reads a typed amount into minor units without touching a float', () => {
    expect(parseMajorUnits('1250')).toBe(125000n)
    expect(parseMajorUnits('1250.5')).toBe(125050n)
    expect(parseMajorUnits('1250.55')).toBe(125055n)
    expect(parseMajorUnits('0')).toBe(0n)
  })

  test('keeps precision a double would lose', () => {
    expect(parseMajorUnits('90071992547409.91')).toBe(9007199254740991n)
  })

  test('refuses anything that is not a plain amount', () => {
    for (const raw of ['', '-5', '1e6', '1,250', '12.345', 'abc', ' 12']) {
      expect(parseMajorUnits(raw)).toBeUndefined()
    }
  })
})

describe('parseSearch', () => {
  test('defaults to an unnarrowed featured listing', () => {
    const search = parseSearch({}, facets)
    expect(search.sort).toBe('featured')
    expect(search.text).toBe('')
    expect(isNarrowed(search)).toBe(false)
  })

  test('accepts the facets that describe a building or its terms', () => {
    const search = parseSearch(
      { type: 'long_lease', buildingType: 'office', scope: 'floor', tenure: 'leasehold', furnished: 'furnished', bedrooms: '3' },
      facets,
    )
    expect(search.type).toBe('long_lease')
    expect(search.buildingType).toBe('office')
    expect(search.scope).toBe('floor')
    expect(search.tenure).toBe('leasehold')
    expect(search.furnished).toBe('furnished')
    expect(search.bedrooms).toBe(3)
    expect(isNarrowed(search)).toBe(true)
  })

  test('drops a value that is not one of the offered options rather than failing', () => {
    const search = parseSearch({ type: 'rent_to_own', buildingType: 'castle', scope: 'wing' }, facets)
    expect(search.type).toBeUndefined()
    expect(search.buildingType).toBeUndefined()
    expect(search.scope).toBeUndefined()
  })

  test('matches a city case insensitively and only from the portfolio', () => {
    expect(parseSearch({ city: 'london' }, facets).city).toBe('London')
    expect(parseSearch({ city: 'Atlantis' }, facets).city).toBeUndefined()
  })

  test('reads area in whole square metres and stores hundredths', () => {
    expect(parseSearch({ minArea: '400' }, facets).minArea).toBe(40000n)
    expect(parseSearch({ minArea: '0' }, facets).minArea).toBeUndefined()
    expect(parseSearch({ minArea: 'big' }, facets).minArea).toBeUndefined()
  })

  test('takes a price range only when a currency is pinned', () => {
    const withCurrency = parseSearch({ currency: 'GBP', minPrice: '250000', maxPrice: '900000' }, facets)
    expect(withCurrency.currency).toBe('GBP')
    expect(withCurrency.minPrice).toBe(25000000n)
    expect(withCurrency.maxPrice).toBe(90000000n)

    const without = parseSearch({ minPrice: '250000', maxPrice: '900000' }, facets)
    expect(without.minPrice).toBeUndefined()
    expect(without.maxPrice).toBeUndefined()
  })

  test('ignores a currency the portfolio does not quote in', () => {
    expect(parseSearch({ currency: 'XXX', minPrice: '10' }, facets).minPrice).toBeUndefined()
  })

  test('falls back from a price sort when no currency is pinned', () => {
    expect(parseSearch({ sort: 'price_asc' }, facets).sort).toBe('featured')
    expect(parseSearch({ sort: 'price_asc', currency: 'EUR' }, facets).sort).toBe('price_asc')
  })

  test('keeps sorts that mean the same thing in every market', () => {
    for (const sort of ['area_desc', 'area_asc', 'year_asc', 'year_desc']) {
      expect(parseSearch({ sort }, facets).sort).toBe(sort as never)
    }
  })

  test('accepts a term in months and an availability date, and rejects nonsense', () => {
    expect(parseSearch({ termMonths: '3' }, facets).termMonths).toBe(3)
    expect(parseSearch({ termMonths: '0' }, facets).termMonths).toBeUndefined()
    expect(parseSearch({ availableBy: '2026-03-01' }, facets).availableBy).toBe('2026-03-01')
    expect(parseSearch({ availableBy: 'March' }, facets).availableBy).toBeUndefined()
  })

  test('caps free text so a query string cannot carry an essay', () => {
    expect(parseSearch({ q: 'x'.repeat(500) }, facets).text).toHaveLength(120)
  })
})

describe('toQueryString', () => {
  test('round trips a search back into the same search', () => {
    const original = parseSearch(
      { q: 'mill', type: 'sale', city: 'London', currency: 'GBP', minPrice: '250000', minArea: '400', sort: 'price_asc' },
      facets,
    )
    expect(parseSearch(Object.fromEntries(new URLSearchParams(toQueryString(original).slice(1))), facets)).toEqual(original)
  })

  test('leaves the default sort out, so the plain listing has a clean URL', () => {
    expect(toQueryString(parseSearch({}, facets))).toBe('')
    expect(toQueryString(parseSearch({ sort: 'area_desc' }, facets))).toBe('?sort=area_desc')
  })

  test('changing one control keeps the rest of the search', () => {
    const search = parseSearch({ q: 'mill', city: 'London', type: 'sale' }, facets)
    const query = toQueryString(search, { type: 'long_lease' })
    expect(query).toContain('q=mill')
    expect(query).toContain('city=London')
    expect(query).toContain('type=long_lease')
  })

  test('clearing one control drops only that one', () => {
    const search = parseSearch({ q: 'mill', city: 'London' }, facets)
    const query = toQueryString(search, { city: undefined })
    expect(query).toContain('q=mill')
    expect(query).not.toContain('city=')
  })

  test('writes money back as the amount a person typed', () => {
    const search = parseSearch({ currency: 'GBP', minPrice: '1250.50' }, facets)
    expect(toQueryString(search)).toContain('minPrice=1250.50')
  })
})
