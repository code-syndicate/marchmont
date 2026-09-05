import { ObjectId, type Db } from 'mongodb'

export type EnquiryRecord = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly message: string
  readonly receivedAt: Date
  readonly offer?: string
}

/**
 * seq exists only to order ties. The _id is a UUID, which carries no time, so
 * two enquiries arriving in the same millisecond would otherwise come back in
 * whatever order the driver felt like. ObjectId embeds a timestamp and a
 * counter, so it breaks the tie in insertion order.
 */
type EnquiryDoc = Omit<EnquiryRecord, 'id'> & { _id: string; seq: ObjectId }

export type NewEnquiry = Omit<EnquiryRecord, 'id' | 'receivedAt'>

export type EnquiryRepository = {
  record(input: NewEnquiry): Promise<string>
  recent(limit?: number): Promise<EnquiryRecord[]>
}

export function createEnquiryRepository(db: Db): EnquiryRepository {
  const collection = db.collection<EnquiryDoc>('enquiries')

  return {
    async record(input) {
      const id = crypto.randomUUID()
      await collection.insertOne({ _id: id, ...input, receivedAt: new Date(), seq: new ObjectId() })
      return id
    },

    async recent(limit = 100) {
      const docs = await collection.find({}).sort({ receivedAt: -1, seq: -1 }).limit(limit).toArray()
      return docs.map(({ _id, seq, ...rest }) => ({ ...rest, id: _id }))
    },
  }
}
