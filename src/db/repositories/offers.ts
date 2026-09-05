import { Long, type Db, type Filter } from 'mongodb'
import { decodeMoney, encodeMoney, type MoneyDoc } from '../codecs'
import { money, type Money } from '../../domain/money'

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
  readonly currency?: string
  readonly scope?: Offer['scope']
  readonly tenure?: NonNullable<Offer['tenure']>
  readonly furnished?: NonNullable<Offer['furnished']>
  /** Matches offers whose term range covers this many months. */
  readonly termMonths?: number
  /** Matches offers available on or before this ISO date. */
  readonly availableBy?: string
  /**
   * Bounds are minor units of `currency`, which must be set alongside them.
   * There is no cross-currency range: comparing markets needs a rate, and the
   * rate here is indicative, so a listing would drop in and out of a result
   * set as it moved.
   */
  readonly minPrice?: bigint
  readonly maxPrice?: bigint
}

export class CurrencylessPriceRange extends Error {
  constructor() {
    super('A price range needs a currency. Amounts in different currencies are not comparable.')
    this.name = 'CurrencylessPriceRange'
  }
}

export type OfferWrite = Omit<Offer, 'id'> & { headlineAmount: bigint }

export type OfferRepository = {
  live(query?: OfferQuery): Promise<Offer[]>
  bySlug(slug: string): Promise<Offer | null>
  forProperty(propertyId: string): Promise<Offer[]>
  countsByType(): Promise<Record<OfferType, number>>
  /** Every offer, whatever its status. Back office only. */
  everything(limit?: number): Promise<Offer[]>
  byId(id: string): Promise<Offer | null>
  create(input: OfferWrite): Promise<Offer>
  update(id: string, patch: Partial<OfferWrite>): Promise<Offer | null>
  /** Conditional on the current status, so two staff cannot both move it. */
  moveStatus(id: string, from: OfferStatus, to: OfferStatus): Promise<Offer | null>
  countsByStatus(): Promise<Record<OfferStatus, number>>
}

/**
 * The headline lands in price for a sale and rentPerMonth for a lease, because
 * the two are genuinely different fields rather than one column with a label.
 */
function moneyFields(input: Partial<OfferWrite>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (input.headlineAmount !== undefined && input.currency) {
    const encoded = encodeMoney(money(input.headlineAmount, input.currency))
    if (input.type === 'sale') fields.price = encoded
    else fields.rentPerMonth = encoded
  }
  if (input.deposit) fields.deposit = encodeMoney(input.deposit)
  if (input.serviceCharge) fields.serviceCharge = encodeMoney(input.serviceCharge)
  return fields
}

export function createOfferRepository(db: Db): OfferRepository {
  const collection = db.collection<OfferDoc>('offers')

  return {
    // Returned in a stable seed order. Ordering by area or year needs the
    // property, and ordering by price has to compare bigint minor units, so
    // both happen once the two sides are joined rather than here.
    async live(query = {}) {
      const filter: Filter<OfferDoc> = { status: 'live' }
      if (query.type) filter.type = query.type
      if (query.buildingIds) filter.propertyId = { $in: [...query.buildingIds] }
      if (query.currency) filter.currency = query.currency
      if (query.scope) filter.scope = query.scope
      if (query.tenure) filter.tenure = query.tenure
      if (query.furnished) filter.furnished = query.furnished

      if (query.termMonths !== undefined) {
        filter.minTermMonths = { $lte: query.termMonths }
        filter.maxTermMonths = { $gte: query.termMonths }
      }

      // ISO dates sort as strings, so no parsing is needed to compare them.
      if (query.availableBy) filter.availableFrom = { $lte: query.availableBy }

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        if (!query.currency) throw new CurrencylessPriceRange()
        const bound: Record<string, Long> = {}
        if (query.minPrice !== undefined) bound.$gte = Long.fromBigInt(query.minPrice)
        if (query.maxPrice !== undefined) bound.$lte = Long.fromBigInt(query.maxPrice)
        // A sale carries price, a lease carries rentPerMonth, and the headline
        // is whichever one is present.
        filter.$or = [{ 'price.amount': bound }, { 'rentPerMonth.amount': bound }] as Filter<OfferDoc>[]
      }

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

    async everything(limit = 500) {
      const docs = await collection.find({}).sort({ _id: 1 }).limit(limit).toArray()
      return docs.map(toOffer)
    },

    async byId(id) {
      const doc = await collection.findOne({ _id: id })
      return doc ? toOffer(doc) : null
    },

    async create(input) {
      const { headline, headlineAmount, deposit, serviceCharge, ...rest } = input
      const doc = {
        _id: crypto.randomUUID(),
        ...rest,
        ...moneyFields(input),
      } as unknown as OfferDoc
      await collection.insertOne(doc)
      return toOffer(doc)
    },

    async update(id, patch) {
      const { headline, headlineAmount, deposit, serviceCharge, ...rest } = patch
      const $set: Record<string, unknown> = { ...rest }
      const money = moneyFields(patch)
      for (const [key, value] of Object.entries(money)) $set[key] = value
      const $unset: Record<string, ''> = {}
      // A field cleared in the form is removed rather than written as null, so
      // an absent term stays absent everywhere that reads it.
      for (const [key, value] of Object.entries(rest)) {
        if (value === undefined || value === '') {
          delete $set[key]
          $unset[key] = ''
        }
      }
      const update: Record<string, unknown> = {}
      if (Object.keys($set).length) update.$set = $set
      if (Object.keys($unset).length) update.$unset = $unset
      if (!Object.keys(update).length) return this.byId(id)

      const result = await collection.findOneAndUpdate({ _id: id }, update as never, { returnDocument: 'after' })
      return result ? toOffer(result) : null
    },

    async moveStatus(id, from, to) {
      const result = await collection.findOneAndUpdate(
        { _id: id, status: from },
        { $set: { status: to } },
        { returnDocument: 'after' },
      )
      return result ? toOffer(result) : null
    },

    async countsByStatus() {
      const rows = await collection
        .aggregate<{ _id: OfferStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }])
        .toArray()
      const counts = {
        draft: 0, pending_review: 0, live: 0, under_offer: 0, let_agreed: 0,
        sold: 0, let: 0, withdrawn: 0, expired: 0,
      } as Record<OfferStatus, number>
      for (const row of rows) counts[row._id] = row.n
      return counts
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
