import type { Db } from 'mongodb'

export type Principal = 'registrant' | 'staff'

export type Session = {
  readonly id: string
  readonly principal: Principal
  readonly subjectId: string
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly lastSeenAt: Date
  /**
   * When two factor is on, a session is only fully authenticated once a code
   * has been presented. Enrolment is not trust, so this is set at sign in and
   * required again before anything sensitive.
   */
  readonly twoFactorAt?: Date
  readonly userAgent?: string
}

type SessionDoc = Omit<Session, 'id'> & { _id: string }

export type NewSession = {
  readonly principal: Principal
  readonly subjectId: string
  readonly lifetimeMs: number
  readonly twoFactorAt?: Date
  readonly userAgent?: string
}

export type SessionRepository = {
  open(input: NewSession): Promise<Session>
  find(id: string): Promise<Session | null>
  touch(id: string): Promise<void>
  markTwoFactor(id: string): Promise<void>
  close(id: string): Promise<void>
  closeAllFor(principal: Principal, subjectId: string): Promise<number>
}

function toSession(doc: SessionDoc): Session {
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}

export function createSessionRepository(db: Db): SessionRepository {
  const collection = db.collection<SessionDoc>('sessions')

  return {
    async open(input) {
      const now = new Date()
      const doc: SessionDoc = {
        // 32 bytes of randomness. The cookie carries this and nothing else, so
        // a stolen cookie is revocable by deleting one row.
        _id: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
        principal: input.principal,
        subjectId: input.subjectId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.lifetimeMs),
        lastSeenAt: now,
        ...(input.twoFactorAt ? { twoFactorAt: input.twoFactorAt } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 200) } : {}),
      }
      await collection.insertOne(doc)
      return toSession(doc)
    },

    // The TTL index reaps expired rows eventually, not promptly, so expiry is
    // also part of the read. A session is never live merely because Mongo has
    // not got round to it.
    async find(id) {
      const doc = await collection.findOne({ _id: id, expiresAt: { $gt: new Date() } })
      return doc ? toSession(doc) : null
    },

    async touch(id) {
      await collection.updateOne({ _id: id }, { $set: { lastSeenAt: new Date() } })
    },

    async markTwoFactor(id) {
      await collection.updateOne({ _id: id }, { $set: { twoFactorAt: new Date() } })
    },

    async close(id) {
      await collection.deleteOne({ _id: id })
    },

    async closeAllFor(principal, subjectId) {
      const result = await collection.deleteMany({ principal, subjectId })
      return result.deletedCount
    },
  }
}
