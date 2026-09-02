import type { Db, Filter } from 'mongodb'
import { decodeMoney, type MoneyDoc } from '../codecs'
import type { Money } from '../../domain/money'

export type OfferType = 'sale' | 'long_lease' | 'corporate_let'

export type OfferStatus =
  | 'draft' | 'pending_review' | 'live'
  | 'under_offer' | 'let_agreed' | 'sold' | 'let'
  | 'withdrawn' | 'expired'

export type Offer = {
  readonly id: string
  readonly slug: string
  readonly propertyId: string
  readonly type: OfferType
  readonly status: OfferStatus
  readonly currency: string
  readonly scope: 'whole' | 'floor' | 'unit'
  readonly scopeLabel: string
  readonly headline: Money
  readonly tenure?: 'freehold' | 'leasehold' | 'commonhold'
  readonly leaseYearsRemaining?: number
  readonly chainStatus?: string
  readonly deposit?: Money
  readonly serviceCharge?: Money
  readonly minTermMonths?: number
  readonly maxTermMonths?: number
  readonly furnished?: 'furnished' | 'part furnished' | 'unfurnished'
  readonly billsIncluded?: readonly string[]
  readonly availableFrom?: string
  readonly availableUntil?: string
  readonly servicedLevel?: string
}

type MoneyField = MoneyDoc | undefined

type OfferDoc = {
  _id: string
  slug: string
  propertyId: string
  type: OfferType
  status: OfferStatus
  currency: string
  scope: 'whole' | 'floor' | 'unit'
  scopeLabel: string
  price?: MoneyField
  rentPerMonth?: MoneyField
  deposit?: MoneyField
  serviceCharge?: MoneyField
  [key: string]: unknown
}

function toOffer(doc: OfferDoc): Offer {
  const headlineDoc = doc.price ?? doc.rentPerMonth
  if (!headlineDoc) throw new Error(`offer ${doc._id} has neither price nor rentPerMonth`)
  const { _id, price, rentPerMonth, deposit, serviceCharge, ...rest } = doc
  return {
    ...(rest as unknown as Omit<Offer, 'id' | 'headline' | 'deposit' | 'serviceCharge'>),
    id: _id,
    headline: decodeMoney(headlineDoc),
    deposit: deposit ? decodeMoney(deposit) : undefined,
    serviceCharge: serviceCharge ? decodeMoney(serviceCharge) : undefined,
  }
}

export type OfferQuery = {
  readonly type?: OfferType
  readonly buildingIds?: readonly string[]
}

export type OfferRepository = {
  live(query?: OfferQuery): Promise<Offer[]>
  bySlug(slug: string): Promise<Offer | null>
  forProperty(propertyId: string): Promise<Offer[]>
  countsByType(): Promise<Record<OfferType, number>>
}

export function createOfferRepository(db: Db): OfferRepository {
  const collection = db.collection<OfferDoc>('offers')

  return {
    async live(query = {}) {
      const filter: Filter<OfferDoc> = { status: 'live' }
      if (query.type) filter.type = query.type
      if (query.buildingIds) filter.propertyId = { $in: [...query.buildingIds] }
      const docs = await collection.find(filter).sort({ _id: 1 }).toArray()
      return docs.map(toOffer)
    },

    async bySlug(slug) {
      const doc = await collection.findOne({ slug })
      return doc ? toOffer(doc) : null
    },

    async forProperty(propertyId) {
      return (await collection.find({ propertyId, status: 'live' }).toArray()).map(toOffer)
    },

    async countsByType() {
      const rows = await collection
        .aggregate<{ _id: OfferType; n: number }>([
          { $match: { status: 'live' } },
          { $group: { _id: '$type', n: { $sum: 1 } } },
        ])
        .toArray()
      const counts = { sale: 0, long_lease: 0, corporate_let: 0 }
      for (const row of rows) counts[row._id] = row.n
      return counts
    },
  }
}
