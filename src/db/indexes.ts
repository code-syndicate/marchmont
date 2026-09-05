import type { Db } from 'mongodb'

const AUDIT_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['at', 'actor', 'action', 'subject'],
    properties: {
      at: { bsonType: 'date' },
      actor: { bsonType: 'string' },
      action: { bsonType: 'string' },
      subject: { bsonType: 'string' },
      detail: { bsonType: 'object' },
    },
  },
}

async function ensureCollection(
  db: Db,
  name: string,
  options: Record<string, unknown> = {},
): Promise<void> {
  const [existing] = await db.listCollections({ name }).toArray()
  if (!existing) await db.createCollection(name, options)
  // An existing collection is left alone. collMod is a privileged command that
  // a shared-tier database user does not hold, and calling it on every boot
  // crashed the second start on Atlas.
}

export async function applySchema(db: Db): Promise<void> {
  await ensureCollection(db, 'audit', {
    validator: AUDIT_VALIDATOR,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await ensureCollection(db, 'properties')
  await ensureCollection(db, 'offers')
  await ensureCollection(db, 'users')
  await ensureCollection(db, 'enquiries')
  await ensureCollection(db, 'sessions')
  await ensureCollection(db, 'credentials')
  await ensureCollection(db, 'staff')
  await ensureCollection(db, 'authAttempts')

  await db.collection('audit').createIndex({ at: -1 })
  await db.collection('audit').createIndex({ subject: 1, at: -1 })

  await db.collection('properties').createIndex({ location: '2dsphere' })
  await db.collection('properties').createIndex({ 'address.countryCode': 1 })
  await db.collection('properties').createIndex({ 'address.locality': 1 })
  await db.collection('properties').createIndex({ buildingType: 1 })
  // One text index per collection is the server limit, so every field the
  // portfolio search reads has to be named here.
  await db.collection('properties').createIndex({
    name: 'text',
    summary: 'text',
    description: 'text',
    features: 'text',
    'address.locality': 'text',
    'address.formatted': 'text',
  })

  await db.collection('offers').createIndex({ status: 1, type: 1 })
  await db.collection('offers').createIndex({ propertyId: 1 })
  await db.collection('offers').createIndex({ status: 1, expiresAt: 1 })

  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  await db.collection('users').createIndex({ accountStatus: 1, createdAt: -1 })

  await db.collection('enquiries').createIndex({ receivedAt: -1 })

  // Mongo reaps expired rows on its own schedule, so every read of a session or
  // a link also checks the expiry. The index is housekeeping, not the rule.
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('sessions').createIndex({ principal: 1, subjectId: 1 })

  await db.collection('credentials').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('credentials').createIndex({ userId: 1, purpose: 1 })

  await db.collection('staff').createIndex({ email: 1 }, { unique: true })

  await db.collection('authAttempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}
