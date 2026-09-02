import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { createAuditRepository } from '../../src/db/repositories/audit'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => { database = await withTestDb() })
afterAll(async () => { await dropTestDb(database) })

describe('audit repository', () => {
  test('appends an entry and stamps the time itself', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({ actor: 'staff:1', action: 'offer.published', subject: 'offer:abc' })
    const [entry] = await audit.recent()
    expect(entry?.actor).toBe('staff:1')
    expect(entry?.action).toBe('offer.published')
    expect(entry?.at).toBeInstanceOf(Date)
  })

  test('exposes no way to change or remove an entry', () => {
    const audit = createAuditRepository(database.db)
    const surface = Object.keys(audit)
    expect(surface.sort()).toEqual(['append', 'forSubject', 'recent'])
    for (const forbidden of ['update', 'delete', 'remove', 'replace', 'clear']) {
      expect(surface.some((key) => key.toLowerCase().includes(forbidden))).toBe(false)
    }
  })

  test('returns a subject trail newest first', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({ actor: 'staff:1', action: 'offer.drafted', subject: 'offer:trail' })
    await audit.append({ actor: 'staff:1', action: 'offer.reviewed', subject: 'offer:trail' })
    await audit.append({ actor: 'staff:2', action: 'offer.published', subject: 'offer:trail' })
    const trail = await audit.forSubject('offer:trail')
    expect(trail.map((entry) => entry.action)).toEqual([
      'offer.published', 'offer.reviewed', 'offer.drafted',
    ])
  })

  test('carries optional structured detail', async () => {
    const audit = createAuditRepository(database.db)
    await audit.append({
      actor: 'staff:1',
      action: 'application.approved',
      subject: 'application:xyz',
      detail: { amount: '25000.00', currency: 'GBP' },
    })
    const [entry] = await audit.forSubject('application:xyz')
    expect(entry?.detail).toEqual({ amount: '25000.00', currency: 'GBP' })
  })

  test('the collection validator rejects a malformed entry', async () => {
    let code: number | undefined
    try {
      await database.db.collection('audit').insertOne({ actor: 'staff:1' } as never)
    } catch (error) {
      code = (error as { code?: number }).code
    }
    expect(code).toBe(121)
  })
})
