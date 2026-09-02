import type { Db } from 'mongodb'
import { decodeArea } from '../codecs'
import type { Area } from '../../domain/area'

export type Address = {
  readonly formatted: string
  readonly countryCode: string
  readonly locality: string
  readonly region?: string
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
}

type PropertyDoc = Omit<Property, 'id' | 'area'> & { _id: string; area: never }

function toProperty(doc: PropertyDoc): Property {
  const { _id, area, ...rest } = doc
  return { ...rest, id: _id, area: decodeArea(area) }
}

export type PropertyRepository = {
  all(): Promise<Property[]>
  byIds(ids: readonly string[]): Promise<Map<string, Property>>
  bySlug(slug: string): Promise<Property | null>
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
  }
}
