import { describe, expect, test } from 'bun:test'
import { createRateLimiter } from '../../src/security/rate-limit'

describe('rate limiter', () => {
  test('allows up to the limit and then refuses', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 })
    expect([1, 2, 3].map(() => limiter.take('a', 0))).toEqual([true, true, true])
    expect(limiter.take('a', 0)).toBe(false)
  })

  test('counts each caller separately', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('b', 0)).toBe(true)
    expect(limiter.take('a', 0)).toBe(false)
  })

  test('lets a caller through again once the window has passed', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 999)).toBe(false)
    expect(limiter.take('a', 1000)).toBe(true)
  })
})
