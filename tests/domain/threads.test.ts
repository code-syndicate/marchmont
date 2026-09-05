import { describe, expect, test } from 'bun:test'
import { bothEngaged, canMoveViewing, contactFor, maskEmail, maskPhone, median } from '../../src/domain/threads'
import { canTransition, nextStatuses } from '../../src/domain/offer-status'

const contact = { email: 'aoife@example.com', phone: '+353 1 555 0134' }

describe('contact release', () => {
  test('is held while only one side has written', () => {
    const oneSided = { messageCount: 3, registrantMessageCount: 3, staffMessageCount: 0 }
    expect(bothEngaged(oneSided)).toBe(false)

    const held = contactFor(oneSided, contact)
    expect(held.released).toBe(false)
    expect(held.email).not.toContain('aoife')
    expect(held.email).not.toContain('example.com')
    expect(held.phone).not.toContain('555')
  })

  test('releases once both have written', () => {
    const engaged = { messageCount: 2, registrantMessageCount: 1, staffMessageCount: 1 }
    const open = contactFor(engaged, contact)
    expect(open.released).toBe(true)
    expect(open.email).toBe('aoife@example.com')
    expect(open.phone).toBe('+353 1 555 0134')
  })

  test('a thread staff opened alone is still one sided', () => {
    expect(bothEngaged({ messageCount: 1, registrantMessageCount: 0, staffMessageCount: 1 })).toBe(false)
  })

  test('a mask keeps enough to recognise your own address and not enough to use', () => {
    const masked = maskEmail('aoife@example.com')
    expect(masked.startsWith('a')).toBe(true)
    expect(masked.endsWith('.com')).toBe(true)
    expect(masked).not.toContain('oife')
    expect(maskPhone('+353 1 555 0134')).toMatch(/^•+134$/)
  })

  test('masks something unusable rather than throwing', () => {
    for (const value of ['', 'not-an-address', '@', 'a@b']) expect(maskEmail(value).length).toBeGreaterThan(0)
    expect(maskPhone('12')).toBe('•••')
  })
})

describe('viewing transitions', () => {
  test('staff can confirm or offer alternatives from a request', () => {
    expect(canMoveViewing('requested', 'confirmed')).toBe(true)
    expect(canMoveViewing('requested', 'proposed')).toBe(true)
  })

  test('a settled viewing does not reopen', () => {
    expect(canMoveViewing('declined', 'confirmed')).toBe(false)
    expect(canMoveViewing('withdrawn', 'confirmed')).toBe(false)
  })
})

describe('offer status', () => {
  test('a lease is never sold and a sale is never let', () => {
    expect(canTransition('live', 'sold', 'sale')).toBe(true)
    expect(canTransition('live', 'sold', 'long_lease')).toBe(false)
    expect(canTransition('live', 'let', 'sale')).toBe(false)
    expect(canTransition('live', 'let', 'long_lease')).toBe(true)
  })

  test('a draft cannot go straight live without review', () => {
    expect(canTransition('draft', 'live', 'sale')).toBe(false)
    expect(nextStatuses('draft', 'sale')).toEqual(['pending_review', 'withdrawn'])
  })

  test('sold and let are terminal, because a building that sells again is a new offer', () => {
    expect(nextStatuses('sold', 'sale')).toEqual([])
    expect(nextStatuses('let', 'long_lease')).toEqual([])
  })

  test('a withdrawn offer goes back to draft rather than straight to live', () => {
    expect(nextStatuses('withdrawn', 'sale')).toEqual(['draft'])
  })
})

describe('median', () => {
  test('handles both parities and an empty set', () => {
    expect(median([])).toBeNull()
    expect(median([4])).toBe(4)
    expect(median([1, 3])).toBe(2)
    expect(median([5, 1, 3])).toBe(3)
  })
})
