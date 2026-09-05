import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database

beforeAll(async () => {
  database = await withTestDb()
})

afterAll(async () => {
  await dropTestDb(database)
})

const registrant = {
  name: 'Aoife Brennan',
  email: 'aoife@example.com',
  intent: 'long_lease' as const,
  market: 'IE',
  requirement: 'Two floors from March.',
}

describe('registrants', () => {
  test('a registration lands as pending, never as approved', async () => {
    const outcome = await database.repositories.users.register(registrant)
    expect(outcome.status).toBe('registered')

    const stored = await database.repositories.users.byEmail('aoife@example.com')
    expect(stored?.accountStatus).toBe('pending')
    expect(stored?.name).toBe('Aoife Brennan')
    expect(stored?.createdAt).toBeInstanceOf(Date)
  })

  test('registering the same address twice does not create a second registrant', async () => {
    const email = 'tomas@example.com'
    const first = await database.repositories.users.register({ ...registrant, email })
    const second = await database.repositories.users.register({ ...registrant, email, name: 'Someone Else' })

    expect(first.status).toBe('registered')
    expect(second.status).toBe('already_registered')
    expect(second.id).toBe(first.id)

    const stored = await database.repositories.users.byEmail(email)
    expect(stored?.name).toBe('Aoife Brennan')
  })

  test('concurrent registrations of one address settle on a single record', async () => {
    const email = 'race@example.com'
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => database.repositories.users.register({ ...registrant, email })),
    )
    expect(new Set(outcomes.map((o) => o.id)).size).toBe(1)
    expect(outcomes.filter((o) => o.status === 'registered')).toHaveLength(1)
  })

  test('an unknown address reads back as nothing', async () => {
    expect(await database.repositories.users.byEmail('nobody@example.com')).toBeNull()
  })
})

describe('enquiries', () => {
  test('an enquiry is recorded and read back most recent first', async () => {
    await database.repositories.enquiries.record({
      name: 'Tomas Vidal',
      email: 'tomas@example.com',
      message: 'Is the fourth floor available from March?',
    })
    await database.repositories.enquiries.record({
      name: 'Greta Lang',
      email: 'greta@example.com',
      message: 'Please send the service charge history.',
      offer: 'water-street-mill-70-fourth-floor',
    })

    const recent = await database.repositories.enquiries.recent()
    expect(recent).toHaveLength(2)
    expect(recent[0]!.name).toBe('Greta Lang')
    expect(recent[0]!.offer).toBe('water-street-mill-70-fourth-floor')
    expect(recent[0]!.receivedAt).toBeInstanceOf(Date)
  })
})
