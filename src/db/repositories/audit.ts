import type { Db } from 'mongodb'

export type AuditEntry = {
  readonly at: Date
  readonly actor: string
  readonly action: string
  readonly subject: string
  readonly detail?: Record<string, unknown>
}

export type AuditRepository = {
  append(entry: Omit<AuditEntry, 'at'>): Promise<void>
  forSubject(subject: string, limit?: number): Promise<AuditEntry[]>
  recent(limit?: number): Promise<AuditEntry[]>
}

export function createAuditRepository(db: Db): AuditRepository {
  const collection = db.collection<AuditEntry>('audit')

  return {
    async append(entry) {
      await collection.insertOne({ ...entry, at: new Date() })
    },

    // Sorting on at alone is non-deterministic: several entries can share a
    // millisecond, and a trail read back in the wrong order misreports who did
    // what first. ObjectId embeds a timestamp and a counter, so it breaks the
    // tie in insertion order.
    async forSubject(subject, limit = 200) {
      return collection.find({ subject }, { projection: { _id: 0 } })
        .sort({ at: -1, _id: -1 }).limit(limit).toArray()
    },

    async recent(limit = 200) {
      return collection.find({}, { projection: { _id: 0 } })
        .sort({ at: -1, _id: -1 }).limit(limit).toArray()
    },
  }
}
