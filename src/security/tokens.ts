import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Single-use links and recovery codes. The raw value goes to the person and is
 * never stored: only its hash is kept, so reading the database does not hand
 * over a live account.
 */

export type IssuedToken = {
  /** Goes in the link. Held by nobody but the recipient. */
  readonly raw: string
  /** Goes in the database. */
  readonly hash: string
}

export function issueToken(bytes = 32): IssuedToken {
  const raw = randomBytes(bytes).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

// Fast, because the input is 32 random bytes rather than something a person
// chose. A slow hash defends against guessing, and there is nothing to guess.
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Recovery codes, in a shape that survives being written down and read back. */
export function issueRecoveryCodes(count = 10): { readonly raw: string[]; readonly hashes: string[] } {
  const raw = Array.from({ length: count }, () => {
    const value = randomBytes(5).toString('hex').toUpperCase()
    return `${value.slice(0, 5)}-${value.slice(5)}`
  })
  return { raw, hashes: raw.map(hashToken) }
}
