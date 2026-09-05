import type { Db } from 'mongodb'
import type { ViewingStatus } from '../../domain/threads'

export type Viewing = {
  readonly id: string
  readonly offerSlug: string
  readonly offerName: string
  readonly registrantId: string
  readonly status: ViewingStatus
  readonly requestedAt: Date
  /** Instants. The building's timezone is what they are shown in. */
  readonly proposedTimes: readonly Date[]
  readonly confirmedTime?: Date
  readonly note?: string
  readonly staffNote?: string
  readonly decidedAt?: Date
  readonly decidedBy?: string
  readonly threadId?: string
}

type ViewingDoc = Omit<Viewing, 'id'> & { _id: string }

export type ViewingRepository = {
  request(input: Omit<Viewing, 'id' | 'status' | 'requestedAt'>): Promise<Viewing>
  byId(id: string): Promise<Viewing | null>
  forRegistrant(registrantId: string): Promise<Viewing[]>
  all(options?: { status?: ViewingStatus; limit?: number }): Promise<Viewing[]>
  /** Conditional on the current status, so two staff cannot both decide. */
  move(id: string, from: ViewingStatus, to: ViewingStatus, patch: Partial<Viewing>): Promise<Viewing | null>
  countByStatus(): Promise<Record<ViewingStatus, number>>
}

const strip = (doc: ViewingDoc): Viewing => {
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}

export function createViewingRepository(db: Db): ViewingRepository {
  const collection = db.collection<ViewingDoc>('viewings')

  return {
    async request(input) {
      const doc: ViewingDoc = {
        _id: crypto.randomUUID(),
        ...input,
        status: 'requested',
        requestedAt: new Date(),
      }
      await collection.insertOne(doc)
      return strip(doc)
    },

    async byId(id) {
      const doc = await collection.findOne({ _id: id })
      return doc ? strip(doc) : null
    },

    async forRegistrant(registrantId) {
      const docs = await collection.find({ registrantId }).sort({ requestedAt: -1 }).toArray()
      return docs.map(strip)
    },

    async all(options = {}) {
      const filter = options.status ? { status: options.status } : {}
      const docs = await collection.find(filter).sort({ requestedAt: -1 }).limit(options.limit ?? 200).toArray()
      return docs.map(strip)
    },

    async move(id, from, to, patch) {
      const { id: _ignored, ...rest } = patch as Viewing
      const result = await collection.findOneAndUpdate(
        { _id: id, status: from },
        { $set: { ...rest, status: to, decidedAt: new Date() } },
        { returnDocument: 'after' },
      )
      return result ? strip(result) : null
    },

    async countByStatus() {
      const rows = await collection
        .aggregate<{ _id: ViewingStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }])
        .toArray()
      const counts: Record<ViewingStatus, number> = {
        requested: 0, proposed: 0, confirmed: 0, declined: 0, withdrawn: 0,
      }
      for (const row of rows) counts[row._id] = row.n
      return counts
    },
  }
}
