import { formatArea, unitForLocale } from '../domain/area'
import { formatMoney, formatMoneyShort, priceBand } from '../domain/money'
import type { Repositories } from '../db/repositories'
import type { ImageProvider, Rendition } from '../providers/images'
import type { Offer, OfferQuery, OfferType } from '../db/repositories/offers'
import type { Search, Sort } from '../domain/search'
import {
  ANONYMOUS,
  canSeeExactPrice,
  PUBLIC_GALLERY_LIMIT,
  addressFor,
  canSeeExactAddress,
  canSeeFullGallery,
  type Viewer,
} from '../domain/viewer'
import type { MapProvider, MapView } from '../providers/maps'
import type { ImageUse, Property } from '../db/repositories/properties'

export type Listing = {
  readonly slug: string
  readonly cover: Rendition | null
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
  /** True when the headline is an indicative band rather than the figure. */
  readonly priceWithheld: boolean
  readonly area: string
  readonly summary: string
  readonly yearBuilt: number
  readonly floors: number
  readonly bedrooms?: number
}

export type ListingDetail = Listing & {
  readonly gallery: readonly Rendition[]
  readonly thumbs: readonly Rendition[]
  readonly formattedAddress: string
  /** True when photographs are being withheld until the viewer is approved. */
  readonly galleryWithheld: boolean
  readonly addressWithheld: boolean
  readonly map: MapView
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

const CARD_SIZES = '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 380px'

/**
 * Which kind of photograph a given offer should lead with. A building can carry
 * an office floor to let, a residence for sale and a serviced apartment at the
 * same time, and each has to look like the thing being offered rather than like
 * whichever picture happened to be first.
 */
function usesFor(offer: Offer, property: Property): ImageUse[] {
  if (offer.scope === 'whole') return ['exterior', 'office', 'residence', 'serviced', 'detail']
  if (offer.type === 'corporate_let') return ['serviced', 'residence', 'exterior', 'detail']
  if (offer.type === 'long_lease') {
    return property.buildingType === 'house'
      ? ['residence', 'serviced', 'exterior', 'detail']
      : ['office', 'exterior', 'residence', 'detail']
  }
  // A sale of part of a building is a residence unless the building is offices.
  return property.buildingType === 'office'
    ? ['office', 'exterior', 'residence', 'detail']
    : ['residence', 'serviced', 'exterior', 'detail']
}

/** The building's photographs, most relevant to this offer first. */
function orderedFor(offer: Offer, property: Property): Property['images'] {
  const wanted = usesFor(offer, property)
  const rank = (image: Property['images'][number]): number => {
    const index = wanted.indexOf(image.use)
    return index === -1 ? wanted.length : index
  }
  return [...property.images].sort((a, b) => rank(a) - rank(b))
}

function coverFor(offer: Offer, property: Property): Property['images'][number] | undefined {
  return orderedFor(offer, property)[0]
}

function toListing(offer: Offer, property: Property, locale: string, images: ImageProvider, viewer: Viewer = ANONYMOUS): Listing {
  const cover = coverFor(offer, property)
  const exact = canSeeExactPrice(viewer)
  const band = exact ? null : priceBand(offer.headline)
  return {
    slug: offer.slug,
    cover: cover ? images.render(cover, 'card', CARD_SIZES) : null,
    name: property.name,
    locality: property.address.locality,
    country: countryName(property.address.countryCode, locale),
    countryCode: property.address.countryCode,
    buildingType: BUILDING_LABEL[property.buildingType],
    scopeLabel: offer.scopeLabel,
    typeLabel: TYPE_LABEL[offer.type],
    type: offer.type,
    headline: band
      ? `${formatMoneyShort(band.from, locale)} to ${formatMoneyShort(band.to, locale)}`
      : formatMoneyShort(offer.headline, locale),
    headlineNote: band ? `${HEADLINE_NOTE[offer.type]}, indicative` : HEADLINE_NOTE[offer.type],
    priceWithheld: Boolean(band),
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

export type Building = {
  readonly slug: string
  readonly name: string
  readonly locality: string
  readonly country: string
  readonly countryCode: string
  readonly buildingType: string
  readonly formattedAddress: string
  readonly yearBuilt: number
  readonly floors: number
  readonly area: string
  readonly summary: string
  readonly lead: Rendition | null
  readonly shots: readonly Rendition[]
  readonly offers: readonly { slug: string; typeLabel: string; headline: string; headlineNote: string; scopeLabel: string }[]
}

export type Facets = {
  readonly cities: readonly string[]
  readonly currencies: readonly string[]
}

export type Portfolio = {
  list(query: OfferQuery, locale: string, viewer?: Viewer): Promise<Listing[]>
  search(search: Search, locale: string, viewer?: Viewer): Promise<Listing[]>
  facets(): Promise<Facets>
  detail(slug: string, locale: string, viewer?: Viewer): Promise<ListingDetail | null>
  counts(): Promise<Record<OfferType, number>>
  buildings(locale: string, viewer?: Viewer): Promise<Building[]>
  featured(locale: string, limit: number, viewer?: Viewer): Promise<Listing[]>
}

type Pair = { offer: Offer; property: Property }

function compare(a: bigint | number, b: bigint | number): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Ordering happens here rather than in the driver because area and year live on
 * the property while price lives on the offer, and price is a bigint of minor
 * units that must never be compared as a float.
 */
function order(pairs: Pair[], sort: Sort): Pair[] {
  if (sort === 'featured') return pairs

  // Several offers can sit in one building and share its area and year, so
  // every key needs a tiebreak or the order of tied rows is whatever the
  // driver happened to return.
  const key = (pair: Pair): bigint | number => {
    switch (sort) {
      case 'area_desc':
      case 'area_asc':
        return pair.property.area.hundredthsM2
      case 'year_asc':
      case 'year_desc':
        return pair.property.yearBuilt
      default:
        return pair.offer.headline.amount
    }
  }

  const descending = sort === 'area_desc' || sort === 'year_desc' || sort === 'price_desc'
  return [...pairs].sort((a, b) => {
    const ranked = descending ? compare(key(b), key(a)) : compare(key(a), key(b))
    return ranked !== 0 ? ranked : a.offer.slug.localeCompare(b.offer.slug)
  })
}

export function createPortfolio(repositories: Repositories, images: ImageProvider, maps: MapProvider): Portfolio {
  const { offers, properties } = repositories

  const listFor = async (query: OfferQuery, locale: string, viewer: Viewer = ANONYMOUS): Promise<Listing[]> => {
    const live = await offers.live(query)
    const byId = await properties.byIds([...new Set(live.map((offer) => offer.propertyId))])
    return live
      .map((offer) => {
        const property = byId.get(offer.propertyId)
        return property ? toListing(offer, property, locale, images, viewer) : null
      })
      .filter((listing): listing is Listing => listing !== null)
  }

  const pairsFor = async (query: OfferQuery, buildingIds?: readonly string[]): Promise<Pair[]> => {
    const live = await offers.live(buildingIds ? { ...query, buildingIds } : query)
    const byId = await properties.byIds([...new Set(live.map((offer) => offer.propertyId))])
    return live
      .map((offer) => {
        const property = byId.get(offer.propertyId)
        return property ? { offer, property } : null
      })
      .filter((pair): pair is Pair => pair !== null)
  }

  return {
    list: listFor,

    async search(criteria, locale, viewer = ANONYMOUS) {
      const wantsProperty =
        criteria.text || criteria.buildingType || criteria.city || criteria.minArea !== undefined || criteria.bedrooms !== undefined

      // An empty match is a real answer, not an absent filter, so it has to be
      // carried through as an empty list rather than dropped.
      const buildingIds = wantsProperty
        ? await properties.matching({
            ...(criteria.text ? { text: criteria.text } : {}),
            ...(criteria.buildingType ? { buildingType: criteria.buildingType } : {}),
            ...(criteria.city ? { locality: criteria.city } : {}),
            ...(criteria.minArea !== undefined ? { minArea: criteria.minArea } : {}),
            ...(criteria.bedrooms !== undefined ? { bedrooms: criteria.bedrooms } : {}),
          })
        : undefined
      if (buildingIds?.length === 0) return []

      const query: OfferQuery = {
        ...(criteria.type ? { type: criteria.type } : {}),
        ...(criteria.scope ? { scope: criteria.scope } : {}),
        ...(criteria.tenure ? { tenure: criteria.tenure } : {}),
        ...(criteria.furnished ? { furnished: criteria.furnished } : {}),
        ...(criteria.currency ? { currency: criteria.currency } : {}),
        ...(criteria.termMonths !== undefined ? { termMonths: criteria.termMonths } : {}),
        ...(criteria.availableBy ? { availableBy: criteria.availableBy } : {}),
        ...(criteria.minPrice !== undefined ? { minPrice: criteria.minPrice } : {}),
        ...(criteria.maxPrice !== undefined ? { maxPrice: criteria.maxPrice } : {}),
      }

      return order(await pairsFor(query, buildingIds), criteria.sort)
        .map(({ offer, property }) => toListing(offer, property, locale, images, viewer))
    },

    async facets() {
      const [all, live] = await Promise.all([properties.all(), offers.live({})])
      const present = new Set(live.map((offer) => offer.propertyId))
      return {
        cities: [...new Set(all.filter((p) => present.has(p.id)).map((p) => p.address.locality))].sort(),
        currencies: [...new Set(live.map((offer) => offer.currency))].sort(),
      }
    },

    counts: () => offers.countsByType(),

    async buildings(locale, viewer = ANONYMOUS) {
      const all = await properties.all()
      const live = await offers.live({})
      return all
        .map((property) => {
          const mine = live.filter((offer) => offer.propertyId === property.id)
          const [lead, ...rest] = property.images
          return {
            slug: property.slug,
            name: property.name,
            locality: property.address.locality,
            country: countryName(property.address.countryCode, locale),
            countryCode: property.address.countryCode,
            buildingType: BUILDING_LABEL[property.buildingType],
            formattedAddress: property.address.formatted,
            yearBuilt: property.yearBuilt,
            floors: property.floors,
            area: formatArea(property.area, unitForLocale(locale), locale),
            summary: property.summary,
            lead: lead ? images.render(lead, 'hero', '(max-width: 900px) 100vw, 1100px') : null,
            shots: rest.map((shot) => images.render(shot, 'plate', '(max-width: 700px) 100vw, 33vw')),
            offers: mine.map((offer) => {
              const band = canSeeExactPrice(viewer) ? null : priceBand(offer.headline)
              return {
                slug: offer.slug,
                typeLabel: TYPE_LABEL[offer.type],
                headline: band
                  ? `${formatMoneyShort(band.from, locale)} to ${formatMoneyShort(band.to, locale)}`
                  : formatMoneyShort(offer.headline, locale),
                headlineNote: band ? `${HEADLINE_NOTE[offer.type]}, indicative` : HEADLINE_NOTE[offer.type],
                scopeLabel: offer.scopeLabel,
              }
            }),
          }
        })
        .filter((building) => building.offers.length > 0)
    },

    async featured(locale, limit, viewer = ANONYMOUS) {
      return (await listFor({}, locale, viewer)).slice(0, limit)
    },

    async detail(slug, locale, viewer = ANONYMOUS) {
      const offer = await offers.bySlug(slug)
      if (!offer || offer.status !== 'live') return null
      const byId = await properties.byIds([offer.propertyId])
      const property = byId.get(offer.propertyId)
      if (!property) return null

      const siblings = (await offers.forProperty(offer.propertyId))
        .filter((other) => other.slug !== offer.slug)
        .map((other) => {
          const band = canSeeExactPrice(viewer) ? null : priceBand(other.headline)
          return {
            slug: other.slug,
            typeLabel: TYPE_LABEL[other.type],
            headline: band
              ? `${formatMoneyShort(band.from, locale)} to ${formatMoneyShort(band.to, locale)}`
              : formatMoneyShort(other.headline, locale),
          }
        })

      const ordered = orderedFor(offer, property)
      const shots = canSeeFullGallery(viewer) ? ordered : ordered.slice(0, PUBLIC_GALLERY_LIMIT)

      return {
        ...toListing(offer, property, locale, images, viewer),
        gallery: shots.map((image, index) =>
          images.render(image, index === 0 ? 'hero' : 'plate', '(max-width: 900px) 100vw, 760px'),
        ),
        thumbs: shots.map((image) => images.render(image, 'thumb', '96px')),
        formattedAddress: addressFor(viewer, property.address),
        galleryWithheld: shots.length < property.images.length,
        addressWithheld: !canSeeExactAddress(viewer),
        map: maps.render(property.coordinates, {
          label: `${property.name}, ${property.address.locality}`,
          precise: canSeeExactAddress(viewer),
        }),
        description: property.description,
        features: property.features,
        terms: termsFor(offer, property, locale),
        coordinates: property.coordinates,
        otherOffers: siblings,
      }
    },
  }
}
