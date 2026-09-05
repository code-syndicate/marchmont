import type { Db } from 'mongodb'

export type EnquiryRecord = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly message: string
  readonly receivedAt: Date
  readonly offer?: string
}

type EnquiryDoc = Omit<EnquiryRecord, 'id'> & { _id: string }

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
      await collection.insertOne({ _id: id, ...input, receivedAt: new Date() })
      return id
    },

    async recent(limit = 100) {
      const docs = await collection.find({}).sort({ receivedAt: -1, _id: -1 }).limit(limit).toArray()
      return docs.map(({ _id, ...rest }) => ({ ...rest, id: _id }))
    },
  }
}
