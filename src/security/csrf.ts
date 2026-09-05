import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const CSRF_COOKIE = 'mc_csrf'
export const CSRF_FIELD = '_csrf'

const LIFETIME_MS = 24 * 60 * 60 * 1000
// A little slack, so a token minted a moment before a clock correction on the
// same host is not treated as forged.
const FUTURE_SLACK_MS = 60 * 1000

function sign(secret: string, salt: string, issuedAt: number): string {
  return createHmac('sha256', secret).update(`${salt}.${issuedAt}`).digest('hex')
}

export function issueToken(secret: string, issuedAt: number = Date.now()): { cookie: string; token: string } {
  const salt = randomBytes(16).toString('hex')
  return { cookie: salt, token: `${salt}.${issuedAt}.${sign(secret, salt, issuedAt)}` }
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Double submit: the salt is held in a cookie the browser will not send
 * cross-site, and the signed token is posted in the form body. A third party
 * site can make the browser post, but cannot read the cookie to match it.
 */
export function verifyToken(secret: string, cookie: string | undefined, token: unknown, now: number = Date.now()): boolean {
  if (!cookie || typeof token !== 'string') return false

  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [salt, rawIssuedAt, signature] = parts as [string, string, string]

  if (!equal(salt, cookie)) return false

  const issuedAt = Number(rawIssuedAt)
  if (!Number.isInteger(issuedAt)) return false
  if (issuedAt > now + FUTURE_SLACK_MS) return false
  if (now - issuedAt > LIFETIME_MS) return false

  return equal(signature, sign(secret, salt, issuedAt))
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    return decodeURIComponent(part.slice(index + 1).trim())
  }
  return undefined
}
