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
  const existing = await db.listCollections({ name }).toArray()
  if (existing.length === 0) {
    await db.createCollection(name, options)
    return
  }
  if (Object.keys(options).length > 0) {
    await db.command({ collMod: name, ...options })
  }
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

  await db.collection('audit').createIndex({ at: -1 })
  await db.collection('audit').createIndex({ subject: 1, at: -1 })

  await db.collection('properties').createIndex({ location: '2dsphere' })
  await db.collection('properties').createIndex({ 'address.countryCode': 1 })

  await db.collection('offers').createIndex({ status: 1, type: 1 })
  await db.collection('offers').createIndex({ propertyId: 1 })
  await db.collection('offers').createIndex({ status: 1, expiresAt: 1 })

  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  await db.collection('users').createIndex({ accountStatus: 1, createdAt: -1 })
}
