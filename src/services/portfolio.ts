import { formatArea, unitForLocale } from '../domain/area'
import { formatMoney, formatMoneyShort } from '../domain/money'
import type { Repositories } from '../db/repositories'
import type { Offer, OfferQuery, OfferType } from '../db/repositories/offers'
import type { Property } from '../db/repositories/properties'

export type Listing = {
  readonly slug: string
  readonly name: string
  readonly locality: string
  readonly country: string
  readonly countryCode: string
  readonly buildingType: string
  readonly scopeLabel: string
  readonly typeLabel: string
  readonly type: OfferType
  readonly headline: string
  readonly headlineNote: string
  readonly area: string
  readonly summary: string
  readonly yearBuilt: number
  readonly floors: number
  readonly bedrooms?: number
}

export type ListingDetail = Listing & {
  readonly formattedAddress: string
  readonly description: readonly string[]
  readonly features: readonly string[]
  readonly terms: readonly { label: string; value: string }[]
  readonly coordinates: readonly [number, number]
  readonly otherOffers: readonly { slug: string; typeLabel: string; headline: string }[]
}

const TYPE_LABEL: Record<OfferType, string> = {
  sale: 'For sale',
  long_lease: 'To let',
  corporate_let: 'Corporate let',
}

const HEADLINE_NOTE: Record<OfferType, string> = {
  sale: 'Guide price',
  long_lease: 'Per calendar month',
  corporate_let: 'Per calendar month',
}

const BUILDING_LABEL: Record<Property['buildingType'], string> = {
  house: 'House',
  office: 'Office',
  mixed: 'Mixed use',
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso))
}

function toListing(offer: Offer, property: Property, locale: string): Listing {
  return {
    slug: offer.slug,
    name: property.name,
    locality: property.address.locality,
    country: countryName(property.address.countryCode, locale),
    countryCode: property.address.countryCode,
    buildingType: BUILDING_LABEL[property.buildingType],
    scopeLabel: offer.scopeLabel,
    typeLabel: TYPE_LABEL[offer.type],
    type: offer.type,
    headline: formatMoneyShort(offer.headline, locale),
    headlineNote: HEADLINE_NOTE[offer.type],
    area: formatArea(property.area, unitForLocale(locale), locale),
    summary: property.summary,
    yearBuilt: property.yearBuilt,
    floors: property.floors,
    bedrooms: property.bedrooms,
  }
}

function termsFor(offer: Offer, property: Property, locale: string): { label: string; value: string }[] {
  const terms: { label: string; value: string }[] = []
  const push = (label: string, value: string | undefined): void => {
    if (value) terms.push({ label, value })
  }

  push('Tenure', offer.tenure ? offer.tenure[0]!.toUpperCase() + offer.tenure.slice(1) : undefined)
  if (offer.leaseYearsRemaining) push('Lease remaining', `${offer.leaseYearsRemaining} years`)
  push('Chain', offer.chainStatus)
  if (offer.deposit) push('Deposit', formatMoneyShort(offer.deposit, locale))
  if (offer.serviceCharge) push('Service charge', `${formatMoneyShort(offer.serviceCharge, locale)} per annum`)
  if (offer.minTermMonths && offer.maxTermMonths) {
    push('Term', `${offer.minTermMonths} to ${offer.maxTermMonths} months`)
  } else if (offer.minTermMonths) {
    push('Minimum term', `${offer.minTermMonths} months`)
  }
  push('Furnished', offer.furnished ? offer.furnished[0]!.toUpperCase() + offer.furnished.slice(1) : undefined)
  push('Serviced', offer.servicedLevel)
  if (offer.billsIncluded?.length) push('Bills included', offer.billsIncluded.join(', '))
  if (offer.availableFrom) push('Available from', formatDate(offer.availableFrom, locale))
  if (offer.availableUntil) push('Available until', formatDate(offer.availableUntil, locale))

  push('Building', `${property.floors} floors, built ${property.yearBuilt}`)
  if (property.bedrooms) push('Bedrooms', String(property.bedrooms))
  if (property.bathrooms) push('Bathrooms', String(property.bathrooms))
  push('Energy rating', property.energyRating)

  return terms
}

export type Portfolio = {
  list(query: OfferQuery, locale: string): Promise<Listing[]>
  detail(slug: string, locale: string): Promise<ListingDetail | null>
  counts(): Promise<Record<OfferType, number>>
  featured(locale: string, limit: number): Promise<Listing[]>
}

export function createPortfolio(repositories: Repositories): Portfolio {
  const { offers, properties } = repositories

  const listFor = async (query: OfferQuery, locale: string): Promise<Listing[]> => {
    const live = await offers.live(query)
    const byId = await properties.byIds([...new Set(live.map((offer) => offer.propertyId))])
    return live
      .map((offer) => {
        const property = byId.get(offer.propertyId)
        return property ? toListing(offer, property, locale) : null
      })
      .filter((listing): listing is Listing => listing !== null)
  }

  return {
    list: listFor,

    counts: () => offers.countsByType(),

    async featured(locale, limit) {
      return (await listFor({}, locale)).slice(0, limit)
    },

    async detail(slug, locale) {
      const offer = await offers.bySlug(slug)
      if (!offer || offer.status !== 'live') return null
      const byId = await properties.byIds([offer.propertyId])
      const property = byId.get(offer.propertyId)
      if (!property) return null

      const siblings = (await offers.forProperty(offer.propertyId))
        .filter((other) => other.slug !== offer.slug)
        .map((other) => ({
          slug: other.slug,
          typeLabel: TYPE_LABEL[other.type],
          headline: formatMoneyShort(other.headline, locale),
        }))

      return {
        ...toListing(offer, property, locale),
        formattedAddress: property.address.formatted,
        description: property.description,
        features: property.features,
        terms: termsFor(offer, property, locale),
        coordinates: property.coordinates,
        otherOffers: siblings,
      }
    },
  }
}
