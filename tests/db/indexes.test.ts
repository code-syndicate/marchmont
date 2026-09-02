import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { applySchema } from '../../src/db/indexes'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('applySchema', () => {
  test('creates every collection the foundation needs', async () => {
    const names = (await database.db.listCollections().toArray()).map((c) => c.name)
    for (const expected of ['audit', 'properties', 'offers', 'users']) {
      expect(names).toContain(expected)
    }
  })

  test('is idempotent', async () => {
    await applySchema(database.db)
    await applySchema(database.db)
    const names = (await database.db.listCollections().toArray()).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('indexes the audit log by time so a trail can be read in order', async () => {
    const indexes = await database.db.collection('audit').indexes()
    const keys = indexes.map((index) => JSON.stringify(index.key))
    expect(keys).toContain(JSON.stringify({ at: -1 }))
  })

  test('indexes offers for the searches the portfolio actually runs', async () => {
    const keys = (await database.db.collection('offers').indexes()).map((i) => JSON.stringify(i.key))
    expect(keys).toContain(JSON.stringify({ status: 1, type: 1 }))
    expect(keys).toContain(JSON.stringify({ propertyId: 1 }))
  })

  test('indexes properties geospatially for map-bounds search', async () => {
    const indexes = await database.db.collection('properties').indexes()
    const geo = indexes.find((index) => index.key.location === '2dsphere')
    expect(geo).toBeDefined()
  })

  test('enforces one account per email address', async () => {
    const email = (await database.db.collection('users').indexes())
      .find((index) => JSON.stringify(index.key) === JSON.stringify({ email: 1 }))
    expect(email?.unique).toBe(true)
  })
})
