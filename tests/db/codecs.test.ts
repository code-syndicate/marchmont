import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Long } from 'mongodb'
import type { Database } from '../../src/db/client'
import { decodeArea, decodeMoney, encodeArea, encodeMoney } from '../../src/db/codecs'
import { areaFromM2 } from '../../src/domain/area'
import { money, parseMoney } from '../../src/domain/money'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('money codec', () => {
  test('encodes to a BSON Long', () => {
    const doc = encodeMoney(parseMoney('1234.56', 'GBP'))
    expect(doc.amount).toBeInstanceOf(Long)
    expect(doc.currency).toBe('GBP')
  })

  test('round-trips in memory', () => {
    const value = parseMoney('45000000.50', 'NGN')
    expect(decodeMoney(encodeMoney(value))).toEqual(value)
  })

  test('survives a real database round trip above 2^53', async () => {
    const value = money(9_007_199_254_740_993n, 'GBP')
    const collection = database.db.collection('codec_probe')
    await collection.insertOne({ _id: 'probe' as never, price: encodeMoney(value) })
    const stored = await collection.findOne({ _id: 'probe' as never })
    expect(decodeMoney(stored!.price).amount).toBe(9_007_199_254_740_993n)
  })

  test('Long.toNumber loses the value the codec preserves', () => {
    const long = Long.fromBigInt(9_007_199_254_740_993n)
    expect(long.toNumber()).toBe(9_007_199_254_740_992)
    expect(long.toBigInt()).toBe(9_007_199_254_740_993n)
  })

  test('rejects a document whose currency is unknown', () => {
    expect(() => decodeMoney({ amount: Long.fromBigInt(1n), currency: 'XYZ' })).toThrow()
  })
})

describe('area codec', () => {
  test('round-trips', () => {
    const area = areaFromM2('1240.55')
    expect(decodeArea(encodeArea(area))).toEqual(area)
  })
})
