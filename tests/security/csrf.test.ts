import { describe, expect, test } from 'bun:test'
import { issueToken, verifyToken } from '../../src/security/csrf'

const secret = 'x'.repeat(32)
const other = 'y'.repeat(32)

describe('csrf tokens', () => {
  test('a freshly issued token verifies against its own cookie', () => {
    const issued = issueToken(secret)
    expect(verifyToken(secret, issued.cookie, issued.token)).toBe(true)
  })

  test('two issues do not collide, so a token is not a fixed string', () => {
    expect(issueToken(secret).token).not.toBe(issueToken(secret).token)
  })

  test('a token minted under another secret is rejected', () => {
    const issued = issueToken(other)
    expect(verifyToken(secret, issued.cookie, issued.token)).toBe(false)
  })

  test('a token is rejected when it does not match the cookie', () => {
    const a = issueToken(secret)
    const b = issueToken(secret)
    expect(verifyToken(secret, a.cookie, b.token)).toBe(false)
  })

  test('a tampered signature is rejected', () => {
    const issued = issueToken(secret)
    const [salt, issuedAt] = issued.token.split('.')
    expect(verifyToken(secret, issued.cookie, `${salt}.${issuedAt}.${'0'.repeat(64)}`)).toBe(false)
  })

  test('a tampered timestamp is rejected, because the signature covers it', () => {
    const issued = issueToken(secret)
    const [salt, , signature] = issued.token.split('.')
    expect(verifyToken(secret, issued.cookie, `${salt}.${Date.now() - 5000}.${signature}`)).toBe(false)
  })

  test('an expired token is rejected', () => {
    const issued = issueToken(secret, Date.now() - 25 * 60 * 60 * 1000)
    expect(verifyToken(secret, issued.cookie, issued.token)).toBe(false)
  })

  test('a token issued in the future is rejected', () => {
    const issued = issueToken(secret, Date.now() + 10 * 60 * 1000)
    expect(verifyToken(secret, issued.cookie, issued.token)).toBe(false)
  })

  test('missing or malformed input is rejected rather than throwing', () => {
    for (const token of ['', 'nonsense', 'a.b', 'a.b.c.d']) {
      expect(verifyToken(secret, 'salt', token)).toBe(false)
    }
    expect(verifyToken(secret, undefined, issueToken(secret).token)).toBe(false)
  })
})
