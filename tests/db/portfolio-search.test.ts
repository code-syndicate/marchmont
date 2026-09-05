import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { CurrencylessPriceRange } from '../../src/db/repositories/offers'
import { parseSearch, type Facets } from '../../src/domain/search'
import { createSandboxImageProvider } from '../../src/providers/images'
import { createSandboxMapProvider } from '../../src/providers/maps'
import { createPortfolio, type Portfolio } from '../../src/services/portfolio'
import { seed } from '../../scripts/seed'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database
let portfolio: Portfolio
let facets: Facets

beforeAll(async () => {
  database = await withTestDb()
  await seed(database)
  portfolio = createPortfolio(database.repositories, createSandboxImageProvider(), createSandboxMapProvider())
  facets = await portfolio.facets()
})

afterAll(async () => {
  await dropTestDb(database)
})

const find = (params: Record<string, unknown>) => portfolio.search(parseSearch(params, facets), 'en-GB')

describe('facets', () => {
  test('offers only the cities and currencies the portfolio actually holds', async () => {
    expect(facets.cities.length).toBeGreaterThan(1)
    expect(facets.currencies.length).toBeGreaterThan(1)
    expect(facets.cities).toEqual([...facets.cities].sort())
    expect(facets.currencies.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true)
  })
})

describe('search', () => {
  test('with no criteria returns everything live', async () => {
    expect((await find({})).length).toBe((await database.repositories.offers.live()).length)
  })

  test('narrows by tenure type', async () => {
    const sale = await find({ type: 'sale' })
    expect(sale.length).toBeGreaterThan(0)
    expect(sale.every((listing) => listing.type === 'sale')).toBe(true)
  })

  test('narrows by city', async () => {
    const city = facets.cities[0]!
    const listings = await find({ city })
    expect(listings.length).toBeGreaterThan(0)
    expect(listings.every((listing) => listing.locality === city)).toBe(true)
  })

  test('narrows by currency', async () => {
    const currency = facets.currencies[0]!
    const listings = await find({ currency })
    const live = await database.repositories.offers.live({ currency })
    expect(listings).toHaveLength(live.length)
    expect(listings.length).toBeGreaterThan(0)
  })

  test('combines a property facet with an offer facet', async () => {
    const listings = await find({ buildingType: 'office', type: 'long_lease' })
    expect(listings.every((l) => l.buildingType === 'Office' && l.type === 'long_lease')).toBe(true)
  })

  test('finds a building by free text over its description', async () => {
    const [any] = await database.repositories.properties.all()
    const word = any!.name.split(' ').pop()!
    const listings = await find({ q: word })
    expect(listings.length).toBeGreaterThan(0)
  })

  test('a text search that matches nothing returns nothing, rather than everything', async () => {
    expect(await find({ q: 'zzzznotabuilding' })).toEqual([])
  })

  test('a city with nothing on those terms returns an empty list', async () => {
    const listings = await find({ city: facets.cities[0]!, bedrooms: '19' })
    expect(listings).toEqual([])
  })

  test('narrows by minimum area, in whole square metres', async () => {
    const all = await database.repositories.properties.all()
    const largest = all.map((p) => p.area.hundredthsM2).reduce((a, b) => (a > b ? a : b))
    const cutoff = largest / 100n
    const listings = await find({ minArea: String(cutoff) })
    expect(listings.length).toBeGreaterThan(0)
    expect((await find({ minArea: String(cutoff * 10n) }))).toEqual([])
  })
})

describe('price', () => {
  test('a range applies within the pinned currency', async () => {
    const currency = facets.currencies[0]!
    const inCurrency = await database.repositories.offers.live({ currency })
    const amounts = inCurrency.map((offer) => offer.headline.amount).sort((a, b) => (a < b ? -1 : 1))
    const cheapest = amounts[0]!

    const listings = await find({ currency, maxPrice: String(cheapest / 100n) })
    expect(listings.length).toBeGreaterThan(0)
    expect(listings.length).toBeLessThanOrEqual(inCurrency.length)
  })

  test('a range without a currency is refused at the repository', async () => {
    expect(database.repositories.offers.live({ minPrice: 100n })).rejects.toThrow(CurrencylessPriceRange)
  })

  test('the search layer never reaches that state, because it drops the range', async () => {
    const listings = await find({ minPrice: '1', maxPrice: '2' })
    expect(listings.length).toBe((await database.repositories.offers.live()).length)
  })
})

describe('order', () => {
  test('by area, largest first and smallest first', async () => {
    const all = await database.repositories.properties.all()
    const areaOf = new Map(all.map((p) => [p.name, p.area.hundredthsM2]))
    const areas = (listings: { name: string }[]) => listings.map((l) => areaOf.get(l.name)!)

    const descending = areas(await find({ sort: 'area_desc' }))
    expect(descending).toEqual([...descending].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)))

    const ascending = areas(await find({ sort: 'area_asc' }))
    expect(ascending).toEqual([...ascending].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  test('ties inside one building are ordered the same way every time', async () => {
    const once = (await find({ sort: 'area_desc' })).map((l) => l.slug)
    const twice = (await find({ sort: 'area_desc' })).map((l) => l.slug)
    expect(once).toEqual(twice)
  })

  test('by year built, oldest first', async () => {
    const years = (await find({ sort: 'year_asc' })).map((l) => l.yearBuilt)
    expect(years).toEqual([...years].sort((a, b) => a - b))
  })

  test('by price within one currency, cheapest first', async () => {
    const currency = facets.currencies[0]!
    const listings = await find({ currency, sort: 'price_asc' })
    const live = await database.repositories.offers.live({ currency })
    const bySlug = new Map(live.map((offer) => [offer.slug, offer.headline.amount]))
    const amounts = listings.map((l) => bySlug.get(l.slug)!)
    expect(amounts).toEqual([...amounts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  test('a price sort with no currency falls back rather than ranking across markets', async () => {
    const fallback = await find({ sort: 'price_asc' })
    expect(fallback.map((l) => l.slug)).toEqual((await find({})).map((l) => l.slug))
  })
})

describe('gate 1 on a detail page', () => {
  const approved = { state: 'approved' } as const
  const pending = { state: 'pending' } as const

  const anyOffer = async () => (await database.repositories.offers.live())[0]!

  test('an approved viewer gets the address as written, an unapproved one gets the district', async () => {
    const offer = await anyOffer()
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const open = await portfolio.detail(offer.slug, 'en-GB', approved)
    const closed = await portfolio.detail(offer.slug, 'en-GB')

    expect(open!.formattedAddress).toBe(property.address.formatted)
    expect(open!.addressWithheld).toBe(false)
    expect(closed!.formattedAddress).not.toBe(property.address.formatted)
    expect(closed!.addressWithheld).toBe(true)
  })

  test('a registrant still awaiting review is treated as unapproved', async () => {
    const offer = await anyOffer()
    expect((await portfolio.detail(offer.slug, 'en-GB', pending))!.addressWithheld).toBe(true)
  })

  test('an approved viewer gets every photograph, and is told nothing is being held back', async () => {
    const offer = await anyOffer()
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const open = await portfolio.detail(offer.slug, 'en-GB', approved)
    expect(open!.gallery).toHaveLength(property.images.length)
    expect(open!.galleryWithheld).toBe(false)
  })

  test('an unapproved viewer gets a shorter gallery, and is told so only when it is true', async () => {
    const offer = await anyOffer()
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const closed = await portfolio.detail(offer.slug, 'en-GB')
    expect(closed!.gallery.length).toBeLessThan(property.images.length)
    expect(closed!.galleryWithheld).toBe(true)
  })

  test('the map for an unapproved viewer does not carry the exact coordinate', async () => {
    const offer = await anyOffer()
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const closed = await portfolio.detail(offer.slug, 'en-GB')
    for (const coordinate of property.coordinates) {
      expect(closed!.map.src).not.toContain(String(coordinate))
    }

    const open = await portfolio.detail(offer.slug, 'en-GB', approved)
    expect(open!.map.src).not.toBe(closed!.map.src)
  })

  test('an unapproved viewer gets a band, an approved one gets the figure', async () => {
    const offer = await anyOffer()
    const open = await portfolio.detail(offer.slug, 'en-GB', approved)
    const closed = await portfolio.detail(offer.slug, 'en-GB')

    expect(open!.priceWithheld).toBe(false)
    expect(closed!.priceWithheld).toBe(true)
    expect(closed!.headline).toContain(' to ')
    expect(closed!.headline).not.toBe(open!.headline)
    expect(closed!.headlineNote).toContain('indicative')
  })

  test('the band brackets the real figure rather than misstating it', async () => {
    const offer = await anyOffer()
    const closed = await portfolio.detail(offer.slug, 'en-GB')
    const [from, to] = closed!.headline.split(' to ')
    const digits = (value: string) => BigInt(value.replace(/[^0-9]/g, ''))
    const exact = offer.headline.amount / 100n

    expect(digits(from!)).toBeLessThanOrEqual(exact)
    expect(digits(to!)).toBeGreaterThanOrEqual(exact)
  })
})
