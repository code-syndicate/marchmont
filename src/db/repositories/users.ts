import type { Db } from 'mongodb'
import type { Intent } from '../../domain/submissions'

export type AccountStatus = 'pending' | 'approved' | 'declined'

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
}

type RegistrantDoc = Omit<Registrant, 'id'> & { _id: string }

export type NewRegistrant = Omit<Registrant, 'id' | 'accountStatus' | 'createdAt'>

export type RegistrationOutcome = { status: 'registered' | 'already_registered'; id: string }

export type UserRepository = {
  register(input: NewRegistrant): Promise<RegistrationOutcome>
  byEmail(email: string): Promise<Registrant | null>
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
  }
}
