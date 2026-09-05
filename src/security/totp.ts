import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * TOTP, RFC 6238, over the SHA-1 HMAC every authenticator app implements.
 * No dependency: this is a counter, an HMAC and a truncation.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const DIGITS = 6
export const STEP_SECONDS = 30
/** One step either side, so a code is not rejected for a slow phone clock. */
const DRIFT_STEPS = 1

export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(secret: string): Buffer | null {
  const cleaned = secret.replace(/=+$/, '').toUpperCase()
  // An empty string decodes to no bytes, which is a valid decoding and an
  // invalid secret. codeAt is the one that refuses to sign with nothing.
  if (/[^A-Z2-7]/.test(cleaned)) return null

  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const character of cleaned) {
    value = (value << 5) | ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function codeAt(secret: string, counter: number): string | null {
  const key = base32Decode(secret)
  if (!key || key.length === 0) return null

  const message = Buffer.alloc(8)
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  message.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1]! & 15
  const binary =
    ((digest[offset]! & 127) << 24) |
    ((digest[offset + 1]! & 255) << 16) |
    ((digest[offset + 2]! & 255) << 8) |
    (digest[offset + 3]! & 255)

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function currentCode(secret: string, now: number = Date.now()): string | null {
  return codeAt(secret, Math.floor(now / 1000 / STEP_SECONDS))
}

/**
 * Returns the counter the code matched, so the caller can refuse a code it has
 * already accepted. Without that, a code stays valid for its whole window and
 * anyone who reads it over a shoulder can replay it.
 */
export function verifyCode(secret: string, code: unknown, now: number = Date.now()): number | null {
  if (typeof code !== 'string') return null
  const cleaned = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(cleaned)) return null

  const step = Math.floor(now / 1000 / STEP_SECONDS)
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    const expected = codeAt(secret, step + drift)
    if (!expected) return null
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned))) return step + drift
  }
  return null
}

/** The otpauth URI an authenticator app reads, usually from a QR code. */
export function enrolmentUri(secret: string, account: string, issuer = 'Marchmont'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}
