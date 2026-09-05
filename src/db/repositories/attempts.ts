import type { Db } from 'mongodb'

/**
 * Failed credential attempts, counted in the database rather than in a process.
 * The in-memory limiter on the public forms loses its count on restart and does
 * not coordinate across replicas, which is tolerable for a contact form and not
 * for a sign in.
 */

export type AttemptRepository = {
  /** Records one attempt and returns how many are now in the window. */
  record(key: string, windowMs: number): Promise<number>
  count(key: string): Promise<number>
  clear(key: string): Promise<void>
}

type AttemptDoc = { _id: string; count: number; expiresAt: Date }

export function createAttemptRepository(db: Db): AttemptRepository {
  const collection = db.collection<AttemptDoc>('authAttempts')

  return {
    async record(key, windowMs) {
      const now = new Date()
      // A window that has already passed is replaced rather than added to, so a
      // caller is not held to attempts made hours ago.
      const existing = await collection.findOne({ _id: key })
      if (!existing || existing.expiresAt <= now) {
        // _id must not appear in a replaceOne replacement document.
        await collection.replaceOne(
          { _id: key },
          { count: 1, expiresAt: new Date(now.getTime() + windowMs) },
          { upsert: true },
        )
        return 1
      }

      const updated = await collection.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 } },
        { returnDocument: 'after' },
      )
      return updated?.count ?? 1
    },

    async count(key) {
      const doc = await collection.findOne({ _id: key, expiresAt: { $gt: new Date() } })
      return doc?.count ?? 0
    },

    async clear(key) {
      await collection.deleteOne({ _id: key })
    },
  }
}
