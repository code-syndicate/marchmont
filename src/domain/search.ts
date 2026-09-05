export type OfferKind = 'sale' | 'long_lease' | 'corporate_let'

export type Sort = 'featured' | 'area_desc' | 'area_asc' | 'year_asc' | 'year_desc' | 'price_asc' | 'price_desc'

export type Facets = {
  readonly cities: readonly string[]
  readonly currencies: readonly string[]
}

export type Search = {
  readonly text: string
  readonly type?: OfferKind
  readonly city?: string
  readonly buildingType?: 'house' | 'office' | 'mixed'
  readonly scope?: 'whole' | 'floor' | 'unit'
  readonly tenure?: 'freehold' | 'leasehold' | 'commonhold'
  readonly furnished?: 'furnished' | 'part furnished' | 'unfurnished'
  readonly currency?: string
  readonly termMonths?: number
  readonly availableBy?: string
  readonly minArea?: bigint
  readonly bedrooms?: number
  readonly minPrice?: bigint
  readonly maxPrice?: bigint
  readonly sort: Sort
}

export const OFFER_KINDS: readonly OfferKind[] = ['sale', 'long_lease', 'corporate_let']
const BUILDING_TYPES = ['house', 'office', 'mixed'] as const
const SCOPES = ['whole', 'floor', 'unit'] as const
const TENURES = ['freehold', 'leasehold', 'commonhold'] as const
const FURNISHINGS = ['furnished', 'part furnished', 'unfurnished'] as const

// Deliberately short. Every facet here describes the building or the terms of
// the offer. Nothing describes who lives nearby, and nothing may: fair housing
// rules in several of the markets in scope forbid it, and a facet that does not
// exist cannot be used to discriminate.
const SORTS: readonly Sort[] = ['featured', 'area_desc', 'area_asc', 'year_asc', 'year_desc', 'price_asc', 'price_desc']

const PRICE_SORTS: readonly Sort[] = ['price_asc', 'price_desc']

const TEXT_LIMIT = 120

export type Params = Record<string, unknown>

function one(params: Params, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : ''
}

function pick<T extends string>(params: Params, key: string, allowed: readonly T[]): T | undefined {
  const value = one(params, key)
  return allowed.find((candidate) => candidate === value)
}

function counting(params: Params, key: string, max: number): number | undefined {
  const raw = one(params, key)
  if (!raw || !/^\d{1,4}$/.test(raw)) return undefined
  const value = Number(raw)
  return value >= 1 && value <= max ? value : undefined
}

/**
 * Money arrives from a query string as a major unit, because that is what a
 * person types. It is parsed digit by digit into minor units so no monetary
 * value ever passes through a float.
 */
export function parseMajorUnits(raw: string, exponent = 2): bigint | undefined {
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(raw)) return undefined
  const [whole, fraction = ''] = raw.split('.') as [string, string?]
  if (fraction.length > exponent) return undefined
  return BigInt(whole + fraction.padEnd(exponent, '0'))
}

export function parseSearch(params: Params, facets: Facets): Search {
  const currency = facets.currencies.find((code) => code === one(params, 'currency').toUpperCase())
  const cityInput = one(params, 'city').toLowerCase()
  const city = facets.cities.find((name) => name.toLowerCase() === cityInput)

  const minPrice = currency ? parseMajorUnits(one(params, 'minPrice')) : undefined
  const maxPrice = currency ? parseMajorUnits(one(params, 'maxPrice')) : undefined

  let sort = SORTS.find((candidate) => candidate === one(params, 'sort')) ?? 'featured'
  // Ordering by price across markets would rank a figure in one currency
  // against a figure in another, which says nothing.
  if (!currency && PRICE_SORTS.includes(sort)) sort = 'featured'

  const minAreaRaw = one(params, 'minArea')
  const minArea = /^\d{1,6}$/.test(minAreaRaw) && Number(minAreaRaw) > 0
    ? BigInt(minAreaRaw) * 100n
    : undefined

  const availableByRaw = one(params, 'availableBy')
  const availableBy = /^\d{4}-\d{2}-\d{2}$/.test(availableByRaw) ? availableByRaw : undefined

  return {
    text: one(params, 'q').slice(0, TEXT_LIMIT),
    type: pick(params, 'type', OFFER_KINDS),
    city,
    buildingType: pick(params, 'buildingType', BUILDING_TYPES),
    scope: pick(params, 'scope', SCOPES),
    tenure: pick(params, 'tenure', TENURES),
    furnished: pick(params, 'furnished', FURNISHINGS),
    currency,
    termMonths: counting(params, 'termMonths', 120),
    availableBy,
    minArea,
    bedrooms: counting(params, 'bedrooms', 20),
    minPrice,
    maxPrice,
    sort,
  }
}

/** True when the search asks for anything beyond the default listing. */
export function isNarrowed(search: Search): boolean {
  const { sort, text, ...rest } = search
  return Boolean(text) || Object.values(rest).some((value) => value !== undefined)
}

/** The search as plain strings, so a template never does arithmetic on a bigint. */
export function toFormValues(search: Search): Record<string, string> {
  return {
    q: search.text,
    type: search.type ?? '',
    city: search.city ?? '',
    buildingType: search.buildingType ?? '',
    scope: search.scope ?? '',
    tenure: search.tenure ?? '',
    furnished: search.furnished ?? '',
    currency: search.currency ?? '',
    termMonths: search.termMonths ? String(search.termMonths) : '',
    availableBy: search.availableBy ?? '',
    minArea: search.minArea ? String(search.minArea / 100n) : '',
    bedrooms: search.bedrooms ? String(search.bedrooms) : '',
    minPrice: search.minPrice !== undefined ? majorUnits(search.minPrice) : '',
    maxPrice: search.maxPrice !== undefined ? majorUnits(search.maxPrice) : '',
    sort: search.sort,
  }
}

function majorUnits(value: bigint): string {
  const whole = value / 100n
  const fraction = value % 100n
  return fraction === 0n ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`
}

/** Rebuilds a query string, so every control on the page keeps the rest of the search. */
export function toQueryString(search: Search, changes: Partial<Record<keyof Search, string | undefined>> = {}): string {
  const params = new URLSearchParams()
  const put = (key: string, value: string | undefined): void => {
    if (value) params.set(key, value)
  }

  const asMajor = (value: bigint | undefined): string | undefined =>
    value === undefined ? undefined : majorUnits(value)

  const base: Record<string, string | undefined> = {
    q: search.text || undefined,
    type: search.type,
    city: search.city,
    buildingType: search.buildingType,
    scope: search.scope,
    tenure: search.tenure,
    furnished: search.furnished,
    currency: search.currency,
    termMonths: search.termMonths ? String(search.termMonths) : undefined,
    availableBy: search.availableBy,
    minArea: search.minArea ? String(search.minArea / 100n) : undefined,
    bedrooms: search.bedrooms ? String(search.bedrooms) : undefined,
    minPrice: asMajor(search.minPrice),
    maxPrice: asMajor(search.maxPrice),
    sort: search.sort === 'featured' ? undefined : search.sort,
  }

  for (const [key, value] of Object.entries({ ...base, ...changes })) put(key, value)
  const query = params.toString()
  return query ? `?${query}` : ''
}
