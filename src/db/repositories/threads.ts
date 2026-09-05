import type { Db } from 'mongodb'
import type { Party } from '../../domain/threads'

export type ThreadMessage = {
  readonly id: string
  readonly from: Party
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly sentAt: Date
}

export type Thread = {
  readonly id: string
  readonly offerSlug: string
  readonly offerName: string
  readonly registrantId: string
  readonly subject: string
  readonly openedAt: Date
  readonly lastMessageAt: Date
  readonly lastMessageFrom: Party
  readonly messages: readonly ThreadMessage[]
  readonly registrantMessageCount: number
  readonly staffMessageCount: number
  readonly messageCount: number
  readonly firstStaffReplyAt?: Date
  readonly closedAt?: Date
  readonly closedBy?: string
}

type ThreadDoc = Omit<Thread, 'id'> & { _id: string }

export type ThreadRepository = {
  open(input: { offerSlug: string; offerName: string; registrantId: string; subject: string; message: Omit<ThreadMessage, 'id' | 'sentAt'> }): Promise<Thread>
  addMessage(threadId: string, message: Omit<ThreadMessage, 'id' | 'sentAt'>): Promise<Thread | null>
  byId(id: string): Promise<Thread | null>
  forRegistrant(registrantId: string): Promise<Thread[]>
  forOffer(offerSlug: string): Promise<Thread[]>
  all(options?: { open?: boolean; limit?: number }): Promise<Thread[]>
  close(id: string, staffId: string): Promise<void>
  reopen(id: string): Promise<void>
}

const strip = (doc: ThreadDoc): Thread => {
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}

export function createThreadRepository(db: Db): ThreadRepository {
  const collection = db.collection<ThreadDoc>('threads')

  const message = (input: Omit<ThreadMessage, 'id' | 'sentAt'>): ThreadMessage => ({
    ...input,
    id: crypto.randomUUID(),
    sentAt: new Date(),
  })

  return {
    async open(input) {
      const first = message(input.message)
      const doc: ThreadDoc = {
        _id: crypto.randomUUID(),
        offerSlug: input.offerSlug,
        offerName: input.offerName,
        registrantId: input.registrantId,
        subject: input.subject,
        openedAt: first.sentAt,
        lastMessageAt: first.sentAt,
        lastMessageFrom: first.from,
        messages: [first],
        registrantMessageCount: first.from === 'registrant' ? 1 : 0,
        staffMessageCount: first.from === 'staff' ? 1 : 0,
        messageCount: 1,
        ...(first.from === 'staff' ? { firstStaffReplyAt: first.sentAt } : {}),
      }
      await collection.insertOne(doc)
      return strip(doc)
    },

    async addMessage(threadId, input) {
      const next = message(input)
      const existing = await collection.findOne({ _id: threadId })
      if (!existing) return null

      const result = await collection.findOneAndUpdate(
        { _id: threadId },
        {
          $push: { messages: next } as never,
          $set: {
            lastMessageAt: next.sentAt,
            lastMessageFrom: next.from,
            // Only the first one, so the measure does not drift as a thread
            // goes back and forth.
            ...(next.from === 'staff' && !existing.firstStaffReplyAt ? { firstStaffReplyAt: next.sentAt } : {}),
          },
          $inc: {
            messageCount: 1,
            ...(next.from === 'staff' ? { staffMessageCount: 1 } : { registrantMessageCount: 1 }),
          },
        },
        { returnDocument: 'after' },
      )
      return result ? strip(result) : null
    },

    async byId(id) {
      const doc = await collection.findOne({ _id: id })
      return doc ? strip(doc) : null
    },

    async forRegistrant(registrantId) {
      const docs = await collection.find({ registrantId }).sort({ lastMessageAt: -1 }).toArray()
      return docs.map(strip)
    },

    async forOffer(offerSlug) {
      const docs = await collection.find({ offerSlug }).sort({ lastMessageAt: -1 }).toArray()
      return docs.map(strip)
    },

    async all(options = {}) {
      const filter = options.open ? { closedAt: { $exists: false } } : {}
      const docs = await collection.find(filter).sort({ lastMessageAt: -1 }).limit(options.limit ?? 200).toArray()
      return docs.map(strip)
    },

    async close(id, staffId) {
      await collection.updateOne({ _id: id }, { $set: { closedAt: new Date(), closedBy: staffId } })
    },

    async reopen(id) {
      await collection.updateOne({ _id: id }, { $unset: { closedAt: '', closedBy: '' } } as never)
    },
  }
}
