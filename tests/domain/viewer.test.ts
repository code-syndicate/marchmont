import { describe, expect, test } from 'bun:test'
import {
  ANONYMOUS,
  addressFor,
  canSeeExactAddress,
  canSeeExactPrice,
  canSeeFullGallery,
  isApproved,
  type Viewer,
} from '../../src/domain/viewer'

const pending: Viewer = { state: 'pending' }
const approved: Viewer = { state: 'approved' }

const address = { formatted: '70 Water Street, Brooklyn, NY 11201', locality: 'New York', region: 'Brooklyn' }

describe('gate 1', () => {
  test('only an approved viewer is approved', () => {
    expect(isApproved(ANONYMOUS)).toBe(false)
    expect(isApproved(pending)).toBe(false)
    expect(isApproved(approved)).toBe(true)
  })

  test('a registrant awaiting review is treated as unapproved, not as half approved', () => {
    expect(canSeeExactAddress(pending)).toBe(false)
    expect(canSeeFullGallery(pending)).toBe(false)
  })

  test('the exact address is released on approval', () => {
    expect(canSeeExactAddress(ANONYMOUS)).toBe(false)
    expect(canSeeExactAddress(approved)).toBe(true)
  })

  test('an unapproved viewer gets the district and city, never the street', () => {
    expect(addressFor(ANONYMOUS, address)).toBe('Brooklyn, New York')
    expect(addressFor(ANONYMOUS, address)).not.toContain('Water Street')
    expect(addressFor(pending, address)).toBe('Brooklyn, New York')
  })

  test('falls back to the city when a building has no district', () => {
    expect(addressFor(ANONYMOUS, { formatted: 'Via Tortona 27, 20144 Milan', locality: 'Milan' })).toBe('Milan')
  })

  test('an approved viewer gets the address as written', () => {
    expect(addressFor(approved, address)).toBe('70 Water Street, Brooklyn, NY 11201')
  })

  test('the precise figure is released on approval, like the rest of gate 1', () => {
    expect(canSeeExactPrice(ANONYMOUS)).toBe(false)
    expect(canSeeExactPrice(pending)).toBe(false)
    expect(canSeeExactPrice(approved)).toBe(true)
  })
})
