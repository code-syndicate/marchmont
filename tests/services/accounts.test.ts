import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from '../../src/db/client'
import { createSandboxMailProvider, type SandboxMailProvider } from '../../src/providers/mail'
import { createAccounts, TWO_FACTOR_FRESHNESS_MS, type Accounts } from '../../src/services/accounts'
import { codeAt, currentCode, generateSecret, STEP_SECONDS } from '../../src/security/totp'
import { dropTestDb, withTestDb } from '../helpers/db'

let database: Database
let accounts: Accounts
let mail: SandboxMailProvider

const PUBLIC_URL = 'https://nashluxuryrealty.test'
const PASSWORD = 'a-long-enough-passphrase'

beforeAll(async () => {
  database = await withTestDb()
  mail = createSandboxMailProvider()
  accounts = createAccounts({ repositories: database.repositories, mail, publicUrl: PUBLIC_URL })
})

afterAll(async () => { await dropTestDb(database) })
beforeEach(() => mail.clear())

let counter = 0
async function makeUser() {
  counter += 1
  const email = `person${counter}@example.com`
  const { id } = await database.repositories.users.register({ name: `Person ${counter}`, email, intent: 'sale' })
  await database.repositories.users.setPassword(id, await accounts.hashPassword(PASSWORD))
  return { id, email }
}

const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!

describe('email verification', () => {
  test('sends a link that verifies the address once', async () => {
    const { id, email } = await makeUser()
    await accounts.startRegistration(id, email, 'Person')

    const letter = mail.lastTo(email)!
    expect(letter.template).toBe('verify_email')
    const token = tokenFrom(letter.action!.url)

    expect((await accounts.verifyEmail(token))?.id).toBe(id)
    expect((await database.repositories.users.byId(id))!.emailVerifiedAt).toBeInstanceOf(Date)
    expect(await accounts.verifyEmail(token)).toBeNull()
  })

  test('says plainly that confirming an address is not approval', async () => {
    const { id, email } = await makeUser()
    await accounts.startRegistration(id, email, 'Person')
    expect(mail.lastTo(email)!.lines.join(' ')).toContain('does not approve the account')
  })

  test('a token that was never issued verifies nothing', async () => {
    expect(await accounts.verifyEmail('made-up-token')).toBeNull()
  })

  test('verifying does not approve the account', async () => {
    const { id, email } = await makeUser()
    await accounts.startRegistration(id, email, 'Person')
    await accounts.verifyEmail(tokenFrom(mail.lastTo(email)!.action!.url))
    expect((await database.repositories.users.byId(id))!.accountStatus).toBe('pending')
  })
})

describe('sign in', () => {
  test('accepts the right password and opens a session', async () => {
    const { id, email } = await makeUser()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.1' })
    expect(result.outcome).toBe('signed_in')
    if (result.outcome !== 'signed_in') throw new Error('expected sign in')
    expect(result.session.subjectId).toBe(id)
    expect(await database.repositories.sessions.find(result.session.id)).not.toBeNull()
  })

  test('refuses the wrong password', async () => {
    const { email } = await makeUser()
    expect((await accounts.signIn({ email, password: 'wrong-passphrase-here', ip: '203.0.113.2' })).outcome).toBe('rejected')
  })

  test('answers an unknown address the same way as a wrong password', async () => {
    expect((await accounts.signIn({ email: 'nobody@example.com', password: PASSWORD, ip: '203.0.113.3' })).outcome).toBe('rejected')
  })

  test('a registrant with no password set cannot sign in', async () => {
    const { id } = await database.repositories.users.register({ name: 'Old', email: 'old@example.com', intent: 'sale' })
    expect((await accounts.signIn({ email: 'old@example.com', password: PASSWORD, ip: '203.0.113.4' })).outcome).toBe('rejected')
    expect(await database.repositories.users.byId(id)).not.toBeNull()
  })

  test('records every failure in the audit trail', async () => {
    const { email } = await makeUser()
    await accounts.signIn({ email, password: 'wrong-passphrase-here', ip: '203.0.113.5' })
    const trail = await database.repositories.audit.forSubject(`email:${email}`)
    expect(trail.map((entry) => entry.action)).toContain('signin.failed')
  })

  test('stops guessing after enough failures, counted in the database so a restart does not reset it', async () => {
    const { email } = await makeUser()
    let limited = false
    for (let attempt = 0; attempt < 14 && !limited; attempt += 1) {
      limited = (await accounts.signIn({ email, password: 'wrong-passphrase-here', ip: '203.0.113.6' })).outcome === 'rate_limited'
    }
    expect(limited).toBe(true)
    expect(await database.repositories.attempts.count(`signin:email:${email}`)).toBeGreaterThan(0)
  })

  test('a successful sign in clears the count for that address', async () => {
    const { email } = await makeUser()
    await accounts.signIn({ email, password: 'wrong-passphrase-here', ip: '203.0.113.7' })
    await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.7' })
    expect(await database.repositories.attempts.count(`signin:email:${email}`)).toBe(0)
  })

  test('signing out closes the session', async () => {
    const { email } = await makeUser()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.8' })
    if (result.outcome !== 'signed_in') throw new Error('expected sign in')
    await accounts.signOut(result.session.id)
    expect(await database.repositories.sessions.find(result.session.id)).toBeNull()
  })
})

describe('password reset', () => {
  test('sets a new password and closes every session the old one had', async () => {
    const { email } = await makeUser()
    const before = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.9' })
    if (before.outcome !== 'signed_in') throw new Error('expected sign in')

    await accounts.requestPasswordReset(email)
    expect(await accounts.completePasswordReset(tokenFrom(mail.lastTo(email)!.action!.url), 'a-different-passphrase')).not.toBeNull()

    expect(await database.repositories.sessions.find(before.session.id)).toBeNull()
    expect((await accounts.signIn({ email, password: 'a-different-passphrase', ip: '203.0.113.9' })).outcome).toBe('signed_in')
    expect((await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.10' })).outcome).toBe('rejected')
  })

  test('a reset link works once', async () => {
    const { email } = await makeUser()
    await accounts.requestPasswordReset(email)
    const token = tokenFrom(mail.lastTo(email)!.action!.url)
    await accounts.completePasswordReset(token, 'first-new-passphrase')
    expect(await accounts.completePasswordReset(token, 'second-new-passphrase')).toBeNull()
  })

  test('asking for a reset on an unknown address sends nothing and reveals nothing', async () => {
    await accounts.requestPasswordReset('nobody@example.com')
    expect(mail.outbox).toHaveLength(0)
  })

  test('a new request invalidates the previous link', async () => {
    const { email } = await makeUser()
    await accounts.requestPasswordReset(email)
    const first = tokenFrom(mail.lastTo(email)!.action!.url)
    await accounts.requestPasswordReset(email)
    expect(await accounts.completePasswordReset(first, 'another-passphrase')).toBeNull()
  })
})

describe('two factor', () => {
  // The code that enrols is spent by enrolling. An app would show the next one a
  // moment later, and a code one step ahead is inside the drift window.
  const nextCode = (secret: string) => codeAt(secret, Math.floor(Date.now() / 1000 / STEP_SECONDS) + 1)!

  async function enrolled() {
    const { id, email } = await makeUser()
    const user = (await database.repositories.users.byId(id))!
    const { secret } = accounts.beginTwoFactorEnrolment(user)
    const codes = await accounts.completeTwoFactorEnrolment(user, secret, currentCode(secret)!)
    return { id, email, secret, codes: codes! }
  }

  test('is off when an account is created', async () => {
    const { id } = await makeUser()
    expect((await database.repositories.users.byId(id))!.twoFactor).toBeUndefined()
  })

  test('the code that enrolled the account cannot then be used to sign in', async () => {
    const { email, secret } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.27' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentCode(result.session, currentCode(secret)!)).toBe(false)
  })

  test('enrols only after a code from the app is shown to work', async () => {
    const { id } = await makeUser()
    const user = (await database.repositories.users.byId(id))!
    const { secret } = accounts.beginTwoFactorEnrolment(user)

    expect(await accounts.completeTwoFactorEnrolment(user, secret, '000000')).toBeNull()
    expect((await database.repositories.users.byId(id))!.twoFactor).toBeUndefined()

    expect(await accounts.completeTwoFactorEnrolment(user, secret, currentCode(secret)!)).toHaveLength(10)
    expect((await database.repositories.users.byId(id))!.twoFactor).toBeDefined()
  })

  test('holds a sign in at the code step rather than completing it', async () => {
    const { email } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.20' })
    expect(result.outcome).toBe('two_factor_required')
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(result.session.twoFactorAt).toBeUndefined()
  })

  test('a correct code completes the session', async () => {
    const { email, secret } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.21' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentCode(result.session, nextCode(secret))).toBe(true)
    expect((await database.repositories.sessions.find(result.session.id))!.twoFactorAt).toBeInstanceOf(Date)
  })

  test('the same code cannot be presented twice inside its window', async () => {
    const { email, secret } = await enrolled()
    const first = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.22' })
    if (first.outcome !== 'two_factor_required') throw new Error('expected the code step')

    const code = nextCode(secret)
    expect(await accounts.presentCode(first.session, code)).toBe(true)

    const second = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.22' })
    if (second.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentCode(second.session, code)).toBe(false)
  })

  test('a recovery code works once and is then gone', async () => {
    const { email, codes } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.23' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentRecoveryCode(result.session, codes[0]!)).toBe(true)

    const again = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.23' })
    if (again.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentRecoveryCode(again.session, codes[0]!)).toBe(false)
  })

  test('recovery codes are not stored as written down', async () => {
    const { id, codes } = await enrolled()
    const stored = (await database.repositories.users.byId(id))!.twoFactor!.recoveryHashes
    for (const code of codes) expect(stored).not.toContain(code)
    expect(stored).toHaveLength(10)
  })

  test('enrolment alone is not trust: a session goes stale and has to prove itself again', async () => {
    const { email, secret } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.24' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    await accounts.presentCode(result.session, nextCode(secret))

    const session = (await database.repositories.sessions.find(result.session.id))!
    expect(accounts.isFresh(session)).toBe(true)
    expect(accounts.isFresh(session, Date.now() + TWO_FACTOR_FRESHNESS_MS + 1000)).toBe(false)
  })

  test('a session that never presented a code is never fresh', async () => {
    const { email } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.25' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(accounts.isFresh(result.session)).toBe(false)
  })

  test('a code for a different secret is refused', async () => {
    const { email } = await enrolled()
    const result = await accounts.signIn({ email, password: PASSWORD, ip: '203.0.113.26' })
    if (result.outcome !== 'two_factor_required') throw new Error('expected the code step')
    expect(await accounts.presentCode(result.session, currentCode(generateSecret())!)).toBe(false)
  })
})

describe('staff decisions', () => {
  test('approving sets the status, records who decided, and writes to the trail', async () => {
    const { id, email } = await makeUser()
    const decided = await accounts.decide({ userId: id, status: 'approved', staffId: 'staff-1' })

    expect(decided!.accountStatus).toBe('approved')
    expect(decided!.decidedBy).toBe('staff-1')
    expect(mail.lastTo(email)!.template).toBe('registration_approved')

    const trail = await database.repositories.audit.forSubject(`user:${id}`)
    expect(trail.find((entry) => entry.action === 'registration.approved')?.actor).toBe('staff:staff-1')
  })

  test('declining tells the registrant plainly and does not string them along', async () => {
    const { id, email } = await makeUser()
    await accounts.decide({ userId: id, status: 'declined', staffId: 'staff-1', reason: 'Outside the markets we hold stock in.' })

    const letter = mail.lastTo(email)!
    expect(letter.template).toBe('registration_declined')
    expect(letter.lines.join(' ')).toContain('not able to take your registration forward')
    expect(letter.action).toBeUndefined()
    expect((await database.repositories.users.byId(id))!.accountStatus).toBe('declined')
  })

  test('a second decision on the same registration does nothing', async () => {
    const { id } = await makeUser()
    expect(await accounts.decide({ userId: id, status: 'approved', staffId: 'staff-1' })).not.toBeNull()
    expect(await accounts.decide({ userId: id, status: 'declined', staffId: 'staff-2' })).toBeNull()
    expect((await database.repositories.users.byId(id))!.accountStatus).toBe('approved')
  })

  test('the queue holds only what is still pending, oldest first', async () => {
    const before = await database.repositories.users.awaitingReview()
    const { id } = await makeUser()
    const after = await database.repositories.users.awaitingReview()

    expect(after.length).toBe(before.length + 1)
    expect(after.every((entry) => entry.accountStatus === 'pending')).toBe(true)

    await accounts.decide({ userId: id, status: 'approved', staffId: 'staff-1' })
    expect((await database.repositories.users.awaitingReview()).map((e) => e.id)).not.toContain(id)
  })
})
