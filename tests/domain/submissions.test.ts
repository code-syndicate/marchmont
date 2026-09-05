import { describe, expect, test } from 'bun:test'
import { validateEnquiry, validateRegistration } from '../../src/domain/submissions'

const registration = {
  name: 'Aoife Brennan',
  email: 'aoife@example.com',
  market: 'IE',
  intent: 'long_lease',
  requirement: 'Two floors, about 400 square metres, from March.',
  offer: 'water-street-mill-70-fourth-floor',
}

describe('registration', () => {
  test('accepts a complete submission and trims it', () => {
    const result = validateRegistration({ ...registration, name: '  Aoife Brennan  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.name).toBe('Aoife Brennan')
    expect(result.value.email).toBe('aoife@example.com')
    expect(result.value.market).toBe('IE')
    expect(result.value.intent).toBe('long_lease')
  })

  test('lowercases the email so the unique index cannot be sidestepped by case', () => {
    const result = validateRegistration({ ...registration, email: 'Aoife@Example.COM' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.email).toBe('aoife@example.com')
  })

  test('requires a name', () => {
    const result = validateRegistration({ ...registration, name: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.name).toBeTruthy()
  })

  test('rejects an address that is not an email', () => {
    for (const email of ['', 'aoife', 'aoife@', '@example.com', 'a b@example.com']) {
      const result = validateRegistration({ ...registration, email })
      expect(result.ok).toBe(false)
    }
  })

  test('rejects an intent that is not an offer type', () => {
    const result = validateRegistration({ ...registration, intent: 'rent-to-own' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.intent).toBeTruthy()
  })

  test('treats no market preference as absent rather than invalid', () => {
    const result = validateRegistration({ ...registration, market: '' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.market).toBeUndefined()
  })

  test('rejects a market that is not a two letter country code', () => {
    const result = validateRegistration({ ...registration, market: 'Ireland' })
    expect(result.ok).toBe(false)
  })

  test('rejects a requirement longer than the field allows', () => {
    const result = validateRegistration({ ...registration, requirement: 'x'.repeat(2001) })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.requirement).toBeTruthy()
  })

  test('reports every problem at once rather than one at a time', () => {
    const result = validateRegistration({ name: '', email: 'no', intent: 'nonsense' })
    if (result.ok) throw new Error('expected failure')
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'intent', 'name'])
  })

  test('ignores a missing offer and keeps one that is present', () => {
    expect(validateRegistration({ ...registration, offer: undefined }).ok).toBe(true)
    const result = validateRegistration(registration)
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.offer).toBe('water-street-mill-70-fourth-floor')
  })
})

describe('enquiry', () => {
  const enquiry = { name: 'Tomas Vidal', email: 'tomas@example.com', message: 'Is the fourth floor still available from March?' }

  test('accepts a complete submission', () => {
    expect(validateEnquiry(enquiry).ok).toBe(true)
  })

  test('requires a message with something in it', () => {
    const result = validateEnquiry({ ...enquiry, message: 'hi' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.message).toBeTruthy()
  })

  test('rejects a message longer than the field allows', () => {
    expect(validateEnquiry({ ...enquiry, message: 'x'.repeat(4001) }).ok).toBe(false)
  })
})
