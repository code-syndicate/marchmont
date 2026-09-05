import { describe, expect, test } from 'bun:test'
import { base32Decode, base32Encode, codeAt, currentCode, enrolmentUri, generateSecret, verifyCode, STEP_SECONDS } from '../../src/security/totp'

// RFC 6238 test vector: the ASCII secret "12345678901234567890" over SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('base32', () => {
  test('round trips', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', '12345678901234567890']) {
      expect(base32Decode(base32Encode(Buffer.from(text)))!.toString()).toBe(text)
    }
  })

  test('refuses characters that are not in the alphabet', () => {
    for (const secret of ['ABC1', 'ABC8', 'abc def!', '!!!']) {
      expect(base32Decode(secret)).toBeNull()
    }
  })
})

describe('codes', () => {
  // Times and codes from RFC 6238 appendix B, SHA-1 column.
  test.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 vector at %i', (seconds, expected) => {
    expect(codeAt(RFC_SECRET, Math.floor(seconds / STEP_SECONDS))).toBe(expected)
  })

  test('is six digits, zero padded', () => {
    const code = currentCode(generateSecret())!
    expect(code).toMatch(/^\d{6}$/)
  })

  test('changes from one step to the next', () => {
    const secret = generateSecret()
    expect(codeAt(secret, 100)).not.toBe(codeAt(secret, 101))
  })
})

describe('verification', () => {
  const secret = generateSecret()
  const now = 1_700_000_000_000

  test('accepts the current code and says which step it matched', () => {
    const step = Math.floor(now / 1000 / STEP_SECONDS)
    expect(verifyCode(secret, currentCode(secret, now), now)).toBe(step)
  })

  test('accepts one step either side, for a phone with a slow clock', () => {
    expect(verifyCode(secret, codeAt(secret, Math.floor(now / 1000 / STEP_SECONDS) - 1), now)).not.toBeNull()
    expect(verifyCode(secret, codeAt(secret, Math.floor(now / 1000 / STEP_SECONDS) + 1), now)).not.toBeNull()
  })

  test('refuses a code from further away than that', () => {
    expect(verifyCode(secret, codeAt(secret, Math.floor(now / 1000 / STEP_SECONDS) - 5), now)).toBeNull()
  })

  test('tolerates spaces, because people type codes in two halves', () => {
    const code = currentCode(secret, now)!
    expect(verifyCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull()
  })

  test('refuses anything that is not six digits', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) {
      expect(verifyCode(secret, code, now)).toBeNull()
    }
  })

  test('a code for one secret does not work for another', () => {
    expect(verifyCode(generateSecret(), currentCode(secret, now), now)).toBeNull()
  })
})

describe('enrolment', () => {
  test('produces a URI an authenticator app can read', () => {
    const uri = enrolmentUri('JBSWY3DPEHPK3PXP', 'aoife@example.com')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=Marchmont')
    expect(uri).toContain('digits=6')
    expect(uri).toContain(encodeURIComponent('Marchmont:aoife@example.com'))
  })
})
