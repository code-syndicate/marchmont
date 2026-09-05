import type { Db } from 'mongodb'

export type CredentialPurpose = 'verify_email' | 'password_reset'

export type Credential = {
  readonly hash: string
  readonly purpose: CredentialPurpose
  readonly userId: string
  readonly createdAt: Date
  readonly expiresAt: Date
}

type CredentialDoc = Credential & { _id: string }

export type CredentialRepository = {
  issue(input: { hash: string; purpose: CredentialPurpose; userId: string; lifetimeMs: number }): Promise<void>
  /** Reads and removes in one write, so a link cannot be followed twice. */
  spend(hash: string, purpose: CredentialPurpose): Promise<Credential | null>
  revokeAllFor(userId: string, purpose: CredentialPurpose): Promise<void>
}

export function createCredentialRepository(db: Db): CredentialRepository {
  const collection = db.collection<CredentialDoc>('credentials')

  return {
    async issue({ hash, purpose, userId, lifetimeMs }) {
      const now = new Date()
      await collection.insertOne({
        _id: hash,
        hash,
        purpose,
        userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + lifetimeMs),
      })
    },

    async spend(hash, purpose) {
      const doc = await collection.findOneAndDelete({ _id: hash, purpose, expiresAt: { $gt: new Date() } })
      return doc ? { hash: doc.hash, purpose: doc.purpose, userId: doc.userId, createdAt: doc.createdAt, expiresAt: doc.expiresAt } : null
    },

    async revokeAllFor(userId, purpose) {
      await collection.deleteMany({ userId, purpose })
    },
  }
}
