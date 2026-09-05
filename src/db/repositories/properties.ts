import { Long, type Db, type Filter } from 'mongodb'
import { decodeArea } from '../codecs'
import type { Area } from '../../domain/area'

export type Address = {
  readonly formatted: string
  readonly countryCode: string
  readonly locality: string
  readonly region?: string
}

export type PropertyImage = {
  readonly id: string
  readonly alt: string
}

export type Property = {
  readonly id: string
  readonly slug: string
  readonly buildingType: 'house' | 'office' | 'mixed'
  readonly name: string
  readonly address: Address
  readonly coordinates: readonly [number, number]
  readonly area: Area
  readonly floors: number
  readonly yearBuilt: number
  readonly summary: string
  readonly description: readonly string[]
  readonly features: readonly string[]
  readonly bedrooms?: number
  readonly bathrooms?: number
  readonly energyRating?: string
  readonly images: readonly PropertyImage[]
}

type PropertyDoc = Omit<Property, 'id' | 'area'> & { _id: string; area: never }

function toProperty(doc: PropertyDoc): Property {
  const { _id, area, ...rest } = doc
  return { ...rest, id: _id, area: decodeArea(area) }
}

export type PropertyQuery = {
  /** Free text over the building, its city and its description. */
  readonly text?: string
  readonly buildingType?: Property['buildingType']
  readonly locality?: string
  /** Hundredths of a square metre, matching the stored unit. */
  readonly minArea?: bigint
  readonly bedrooms?: number
}

export type PropertyRepository = {
  all(): Promise<Property[]>
  byIds(ids: readonly string[]): Promise<Map<string, Property>>
  bySlug(slug: string): Promise<Property | null>
  /** Ids of the buildings a query matches, for intersecting with an offer query. */
  matching(query: PropertyQuery): Promise<string[]>
}

export function createPropertyRepository(db: Db): PropertyRepository {
  const collection = db.collection<PropertyDoc>('properties')

  return {
    async all() {
      return (await collection.find({}).toArray()).map(toProperty)
    },

    async byIds(ids) {
      const docs = await collection.find({ _id: { $in: [...ids] } }).toArray()
      return new Map(docs.map((doc) => [doc._id, toProperty(doc)]))
    },

    async bySlug(slug) {
      const doc = await collection.findOne({ slug })
      return doc ? toProperty(doc) : null
    },

    async matching(query) {
      // Property is readonly throughout, so the filter is assembled loosely and
      // narrowed once on the way into the driver.
      const filter: Record<string, unknown> = {}
      if (query.text) filter.$text = { $search: query.text }
      if (query.buildingType) filter.buildingType = query.buildingType
      if (query.locality) filter['address.locality'] = query.locality
      if (query.minArea !== undefined) filter.area = { $gte: Long.fromBigInt(query.minArea) }
      if (query.bedrooms !== undefined) filter.bedrooms = { $gte: query.bedrooms }

      const docs = await collection.find(filter as Filter<PropertyDoc>, { projection: { _id: 1 } }).toArray()
      return docs.map((doc) => doc._id)
    },
  }
}
