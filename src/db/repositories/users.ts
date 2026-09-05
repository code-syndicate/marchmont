import type { Db } from 'mongodb'
import type { Intent } from '../../domain/submissions'

export type AccountStatus = 'pending' | 'approved' | 'declined'

export type TwoFactor = {
  readonly secret: string
  readonly enrolledAt: Date
  /** Recovery codes, hashed. A spent one is removed rather than marked. */
  readonly recoveryHashes: readonly string[]
  /** The last TOTP step accepted, so a code cannot be replayed inside its window. */
  readonly lastStep?: number
}

export type Registrant = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly intent: Intent
  readonly accountStatus: AccountStatus
  readonly createdAt: Date
  readonly market?: string
  readonly requirement?: string
  readonly offer?: string
  readonly phone?: string
  readonly passwordHash?: string
  readonly emailVerifiedAt?: Date
  readonly twoFactor?: TwoFactor
  readonly decidedAt?: Date
  readonly decidedBy?: string
  readonly declineReason?: string
}

type RegistrantDoc = Omit<Registrant, 'id'> & { _id: string }

export type NewRegistrant = Omit<Registrant, 'id' | 'accountStatus' | 'createdAt'>

export type RegistrationOutcome = { status: 'registered' | 'already_registered'; id: string }

export type Decision = { by: string; at?: Date; reason?: string }

export type UserRepository = {
  register(input: NewRegistrant): Promise<RegistrationOutcome>
  byEmail(email: string): Promise<Registrant | null>
  byId(id: string): Promise<Registrant | null>
  setPassword(id: string, passwordHash: string): Promise<void>
  markEmailVerified(id: string): Promise<void>
  enrolTwoFactor(id: string, twoFactor: TwoFactor): Promise<void>
  recordTwoFactorStep(id: string, step: number): Promise<void>
  spendRecoveryCode(id: string, hash: string): Promise<boolean>
  disableTwoFactor(id: string): Promise<void>
  decide(id: string, status: Exclude<AccountStatus, 'pending'>, decision: Decision): Promise<Registrant | null>
  awaitingReview(limit?: number): Promise<Registrant[]>
  all(options?: { status?: AccountStatus; search?: string; limit?: number }): Promise<Registrant[]>
  setPhone(id: string, phone: string | null): Promise<void>
  /** Puts an account back in the queue, which is an audited staff act. */
  reopen(id: string): Promise<Registrant | null>
  countByStatus(): Promise<Record<AccountStatus, number>>
}

function toRegistrant(doc: RegistrantDoc): Registrant {
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}

export function createUserRepository(db: Db): UserRepository {
  const collection = db.collection<RegistrantDoc>('users')

  return {
    // A second registration from the same address is not an error the visitor
    // caused, and telling them the address is taken would confirm who is on the
    // list to anyone who guesses. The unique index decides; both paths render
    // the same acknowledgement.
    async register(input) {
      const existing = await collection.findOne({ email: input.email })
      if (existing) return { status: 'already_registered', id: existing._id }

      const id = crypto.randomUUID()
      try {
        await collection.insertOne({
          _id: id,
          ...input,
          accountStatus: 'pending',
          createdAt: new Date(),
        })
        return { status: 'registered', id }
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          const winner = await collection.findOne({ email: input.email })
          if (winner) return { status: 'already_registered', id: winner._id }
        }
        throw error
      }
    },

    async byEmail(email) {
      const doc = await collection.findOne({ email })
      return doc ? toRegistrant(doc) : null
    },

    async byId(id) {
      const doc = await collection.findOne({ _id: id })
      return doc ? toRegistrant(doc) : null
    },

    async setPassword(id, passwordHash) {
      await collection.updateOne({ _id: id }, { $set: { passwordHash } })
    },

    async markEmailVerified(id) {
      await collection.updateOne({ _id: id }, { $set: { emailVerifiedAt: new Date() } })
    },

    async enrolTwoFactor(id, twoFactor) {
      await collection.updateOne({ _id: id }, { $set: { twoFactor } })
    },

    async recordTwoFactorStep(id, step) {
      await collection.updateOne({ _id: id }, { $set: { 'twoFactor.lastStep': step } })
    },

    // Spending is the same write as checking, so two requests carrying one code
    // cannot both find it present and both succeed.
    async spendRecoveryCode(id, hash) {
      const result = await collection.updateOne(
        { _id: id, 'twoFactor.recoveryHashes': hash },
        { $pull: { 'twoFactor.recoveryHashes': hash } } as never,
      )
      return result.modifiedCount === 1
    },

    async disableTwoFactor(id) {
      await collection.updateOne({ _id: id }, { $unset: { twoFactor: '' } } as never)
    },

    // Conditional on the account still being pending, so two reviewers acting
    // at once cannot both record a decision and the second is told nothing
    // changed rather than silently overwriting the first.
    async decide(id, status, decision) {
      const result = await collection.findOneAndUpdate(
        { _id: id, accountStatus: 'pending' },
        {
          $set: {
            accountStatus: status,
            decidedAt: decision.at ?? new Date(),
            decidedBy: decision.by,
            ...(decision.reason ? { declineReason: decision.reason } : {}),
          },
        },
        { returnDocument: 'after' },
      )
      return result ? toRegistrant(result) : null
    },

    async awaitingReview(limit = 100) {
      const docs = await collection
        .find({ accountStatus: 'pending' })
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .toArray()
      return docs.map(toRegistrant)
    },

    async all(options = {}) {
      const filter: Record<string, unknown> = {}
      if (options.status) filter.accountStatus = options.status
      if (options.search) {
        const safe = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        filter.$or = [{ email: { $regex: safe, $options: 'i' } }, { name: { $regex: safe, $options: 'i' } }]
      }
      const docs = await collection.find(filter).sort({ createdAt: -1 }).limit(options.limit ?? 200).toArray()
      return docs.map(toRegistrant)
    },

    async setPhone(id, phone) {
      await collection.updateOne(
        { _id: id },
        phone ? { $set: { phone } } : ({ $unset: { phone: '' } } as never),
      )
    },

    async reopen(id) {
      const result = await collection.findOneAndUpdate(
        { _id: id },
        { $set: { accountStatus: 'pending' }, $unset: { decidedAt: '', decidedBy: '', declineReason: '' } } as never,
        { returnDocument: 'after' },
      )
      return result ? toRegistrant(result) : null
    },

    async countByStatus() {
      const rows = await collection
        .aggregate<{ _id: AccountStatus; n: number }>([{ $group: { _id: '$accountStatus', n: { $sum: 1 } } }])
        .toArray()
      const counts: Record<AccountStatus, number> = { pending: 0, approved: 0, declined: 0 }
      for (const row of rows) counts[row._id] = row.n
      return counts
    },
  }
}
