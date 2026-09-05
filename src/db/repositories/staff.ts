import type { Db } from 'mongodb'

/**
 * Staff are a separate collection rather than a role on a registrant. A
 * registrant and a reviewer are different kinds of account, and collapsing them
 * means a defect in the public registration form could mint a reviewer.
 */

export type StaffMember = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly passwordHash: string
  readonly createdAt: Date
  readonly active: boolean
}

type StaffDoc = Omit<StaffMember, 'id'> & { _id: string }

export type StaffRepository = {
  add(input: { name: string; email: string; passwordHash: string }): Promise<StaffMember>
  byEmail(email: string): Promise<StaffMember | null>
  byId(id: string): Promise<StaffMember | null>
  count(): Promise<number>
}

function toStaff(doc: StaffDoc): StaffMember {
  const { _id, ...rest } = doc
  return { ...rest, id: _id }
}

export function createStaffRepository(db: Db): StaffRepository {
  const collection = db.collection<StaffDoc>('staff')

  return {
    async add(input) {
      const doc: StaffDoc = { _id: crypto.randomUUID(), ...input, createdAt: new Date(), active: true }
      await collection.insertOne(doc)
      return toStaff(doc)
    },

    async byEmail(email) {
      const doc = await collection.findOne({ email, active: true })
      return doc ? toStaff(doc) : null
    },

    async byId(id) {
      const doc = await collection.findOne({ _id: id, active: true })
      return doc ? toStaff(doc) : null
    },

    count: () => collection.countDocuments(),
  }
}
