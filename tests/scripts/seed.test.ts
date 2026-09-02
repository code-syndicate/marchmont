import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { seed } from '../../scripts/seed'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('seed', () => {
  test('creates properties and offers', async () => {
    const counts = await seed(database)
    expect(counts.properties).toBeGreaterThan(0)
    expect(counts.offers).toBeGreaterThan(0)
  })

  test('is safe to run twice', async () => {
    await seed(database)
    const after = await database.db.collection('properties').countDocuments()
    await seed(database)
    expect(await database.db.collection('properties').countDocuments()).toBe(after)
  })

  test('every seeded price is stored as a Long, never a double', async () => {
    await seed(database)
    for await (const offer of database.db.collection('offers').find()) {
      const price = offer.price ?? offer.rentPerMonth
      expect(price.amount._bsontype).toBe('Long')
      expect(typeof price.currency).toBe('string')
    }
  })

  test('seeded copy carries no em dash or en dash', async () => {
    await seed(database)
    for await (const property of database.db.collection('properties').find()) {
      expect(JSON.stringify(property)).not.toMatch(/[–—]/)
    }
  })
})
