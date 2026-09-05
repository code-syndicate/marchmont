import { Long, type Db, type Filter } from 'mongodb'
import { decodeArea, encodeArea } from '../codecs'
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
  /** IANA zone. Viewing times are instants; this is what they are shown in. */
  readonly timeZone?: string
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
  byId(id: string): Promise<Property | null>
  create(input: Omit<Property, 'id'>): Promise<Property>
  update(id: string, patch: Partial<Omit<Property, 'id' | 'area'>> & { area?: Property['area'] }): Promise<Property | null>
  remove(id: string): Promise<void>
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

    async byId(id) {
      const doc = await collection.findOne({ _id: id })
      return doc ? toProperty(doc) : null
    },

    async create(input) {
      const { area, ...rest } = input
      const doc = { _id: crypto.randomUUID(), ...rest, area: encodeArea(area) } as unknown as PropertyDoc
      await collection.insertOne(doc)
      return toProperty(doc)
    },

    async update(id, patch) {
      const { area, ...rest } = patch
      const $set: Record<string, unknown> = { ...rest }
      if (area) $set.area = encodeArea(area)
      const result = await collection.findOneAndUpdate({ _id: id }, { $set } as never, { returnDocument: 'after' })
      return result ? toProperty(result) : null
    },

    // Only reachable when nothing points at it. The service checks; this does
    // not, because a repository that silently refuses is worse than one that
    // does what it is told.
    async remove(id) {
      await collection.deleteOne({ _id: id })
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
