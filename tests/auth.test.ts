import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { Server } from 'node:http'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import type { Database } from '../src/db/client'
import { createSandboxMailProvider, type SandboxMailProvider } from '../src/providers/mail'
import { codeAt, currentCode, STEP_SECONDS } from '../src/security/totp'
import { seed } from '../scripts/seed'
import { dropTestDb, withTestDb } from './helpers/db'

let database: Database
let server: Server
let origin: string
let mail: SandboxMailProvider

const PUBLIC_URL = 'https://marchmont.test'
const PASSWORD = 'a-long-enough-passphrase'

beforeAll(async () => {
  database = await withTestDb()
  await seed(database)
  mail = createSandboxMailProvider()
  const config = loadConfig({
    NODE_ENV: 'test', PORT: '3000',
    MONGO_URL: 'mongodb://127.0.0.1:27017', MONGO_DB: 'marchmont_test',
    SESSION_SECRET: 'x'.repeat(32), PUBLIC_URL,
    IMAGES_PROVIDER: 'sandbox', MAPS_PROVIDER: 'sandbox', MAIL_PROVIDER: 'sandbox',
  })
  // This file registers and signs in many times over. The public form
  // allowance is exercised deliberately in tests/app.test.ts instead.
  server = createApp({ config, database, mail, submissionLimit: { limit: 10_000, windowMs: 60_000 } }).listen(0)
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(async () => {
  server.close()
  await dropTestDb(database)
})

beforeEach(() => mail.clear())

/** A browser: keeps cookies across requests and reads the CSRF token off each page. */
function browser() {
  const jar = new Map<string, string>()

  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ')

  const absorb = (response: Response): void => {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const index = pair!.indexOf('=')
      const name = pair!.slice(0, index)
      const value = pair!.slice(index + 1)
      if (value === '') jar.delete(name)
      else jar.set(name, value)
    }
  }

  const get = async (path: string): Promise<{ status: number; body: string; token: string; location: string | null }> => {
    const response = await fetch(`${origin}${path}`, { headers: { cookie: cookieHeader() }, redirect: 'manual' })
    absorb(response)
    const body = await response.text()
    return {
      status: response.status,
      body,
      token: /name="_csrf" value="([^"]+)"/.exec(body)?.[1] ?? '',
      location: response.headers.get('location'),
    }
  }

  const post = async (path: string, fields: Record<string, string>): Promise<{ status: number; body: string; location: string | null }> => {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
      body: new URLSearchParams(fields).toString(),
      redirect: 'manual',
    })
    absorb(response)
    return { status: response.status, body: await response.text(), location: response.headers.get('location') }
  }

  /** Loads the form first so the posted token matches the cookie the page set. */
  const submit = async (path: string, fields: Record<string, string>, formPath = path) => {
    const { token } = await get(formPath)
    return post(path, { ...fields, _csrf: token })
  }

  return { get, post, submit, jar }
}

let counter = 0
async function register(client: ReturnType<typeof browser>, overrides: Record<string, string> = {}) {
  counter += 1
  const email = `route${counter}@example.com`
  const response = await client.submit('/register', {
    name: `Route ${counter}`, email, intent: 'sale', password: PASSWORD, ...overrides,
  })
  return { email, response }
}

const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!

describe('registration through the site', () => {
  test('creates a pending account, sets a password and sends a verification link', async () => {
    const client = browser()
    const { email, response } = await register(client)

    expect(response.status).toBe(303)
    expect(response.location).toBe('/register/received')

    const user = await database.repositories.users.byEmail(email)
    expect(user!.accountStatus).toBe('pending')
    expect(user!.passwordHash).toBeTruthy()
    expect(user!.emailVerifiedAt).toBeUndefined()
    expect(mail.lastTo(email)!.template).toBe('verify_email')
  })

  test('the password is not stored as typed', async () => {
    const client = browser()
    const { email } = await register(client)
    const user = await database.repositories.users.byEmail(email)
    expect(user!.passwordHash).not.toContain(PASSWORD)
    expect(user!.passwordHash!.startsWith('$argon2id$')).toBe(true)
  })

  test('following the link confirms the address without approving the account', async () => {
    const client = browser()
    const { email } = await register(client)
    const link = tokenFrom(mail.lastTo(email)!.action!.url)

    const page = await client.get(`/verify?token=${encodeURIComponent(link)}`)
    expect(page.status).toBe(200)
    expect(page.body).toContain('Email address confirmed')
    expect(page.body).toContain('reviewing your registration')

    const user = await database.repositories.users.byEmail(email)
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date)
    expect(user!.accountStatus).toBe('pending')
  })

  test('a spent or invented link says so rather than failing', async () => {
    const page = await browser().get('/verify?token=never-issued')
    expect(page.status).toBe(400)
    expect(page.body).toContain('That link has expired')
  })
})

describe('signing in', () => {
  test('a pending registrant can sign in and sees their status', async () => {
    const client = browser()
    const { email } = await register(client)

    const signedIn = await client.submit('/signin', { email, password: PASSWORD })
    expect(signedIn.status).toBe(303)
    expect(signedIn.location).toBe('/account')

    const account = await client.get('/account')
    expect(account.status).toBe(200)
    expect(account.body).toContain('Awaiting review')
  })

  test('a wrong password and an unknown address give the same answer', async () => {
    const client = browser()
    const { email } = await register(client)

    const wrong = await client.submit('/signin', { email, password: 'not-the-right-passphrase' })
    const unknown = await client.submit('/signin', { email: 'nobody@example.com', password: PASSWORD })

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toContain('do not match')
    expect(unknown.body).toContain('do not match')
  })

  test('the session cookie is not readable by script and does not travel cross site', async () => {
    const client = browser()
    const { email } = await register(client)
    const response = await fetch(`${origin}/signin`, { headers: { cookie: '' } })
    const token = /name="_csrf" value="([^"]+)"/.exec(await response.text())![1]!
    const cookie = (response.headers.getSetCookie?.() ?? []).join('; ')

    const signIn = await fetch(`${origin}/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ email, password: PASSWORD, _csrf: token }).toString(),
      redirect: 'manual',
    })
    const set = (signIn.headers.getSetCookie?.() ?? []).find((line) => line.startsWith('mc_session='))!
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
  })

  test('signing out ends the session and the account page is no longer reachable', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })
    expect((await client.get('/account')).status).toBe(200)

    await client.submit('/signout', {}, '/account')
    const after = await client.get('/account')
    expect(after.status).toBe(303)
    expect(after.location).toContain('/signin')
  })

  test('a signed out visitor asking for the account page is sent to sign in and back again', async () => {
    const response = await browser().get('/account')
    expect(response.status).toBe(303)
    expect(response.location).toBe(`/signin?next=${encodeURIComponent('/account')}`)
  })

  test('a sign in with no csrf token is refused', async () => {
    const client = browser()
    const { email } = await register(client)
    const response = await client.post('/signin', { email, password: PASSWORD })
    expect(response.status).toBe(403)
  })

  test('auth pages are never cached', async () => {
    for (const path of ['/signin', '/forgotten', '/reset']) {
      const response = await fetch(`${origin}${path}`)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
  })
})

describe('password reset through the site', () => {
  test('answers the same whether or not the address is known', async () => {
    const client = browser()
    const { email } = await register(client)

    const known = await client.submit('/forgotten', { email })
    const unknown = await client.submit('/forgotten', { email: 'nobody@example.com' })

    expect(known.location).toBe('/forgotten/sent')
    expect(unknown.location).toBe('/forgotten/sent')
    expect(mail.lastTo('nobody@example.com')).toBeUndefined()
  })

  test('sets a new password and signs every session out', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })

    await client.submit('/forgotten', { email })
    const token = tokenFrom(mail.lastTo(email)!.action!.url)

    const reset = await client.submit('/reset', { token, password: 'a-brand-new-passphrase', confirm: 'a-brand-new-passphrase' }, `/reset?token=${token}`)
    expect(reset.location).toBe('/signin?reset=1')

    expect((await client.get('/account')).status).toBe(303)

    const fresh = browser()
    expect((await fresh.submit('/signin', { email, password: 'a-brand-new-passphrase' })).location).toBe('/account')
  })

  test('refuses a password that does not match its confirmation', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/forgotten', { email })
    const token = tokenFrom(mail.lastTo(email)!.action!.url)

    const response = await client.submit('/reset', { token, password: 'a-brand-new-passphrase', confirm: 'something-else-here' }, `/reset?token=${token}`)
    expect(response.status).toBe(422)
    expect(response.body).toContain('Both passwords must match')
  })

  test('refuses a weak password and says why', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/forgotten', { email })
    const token = tokenFrom(mail.lastTo(email)!.action!.url)

    const response = await client.submit('/reset', { token, password: 'short', confirm: 'short' }, `/reset?token=${token}`)
    expect(response.status).toBe(422)
    expect(response.body).toContain('at least 12 characters')
  })

  test('a spent link cannot be used again', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/forgotten', { email })
    const token = tokenFrom(mail.lastTo(email)!.action!.url)

    await client.submit('/reset', { token, password: 'first-new-passphrase', confirm: 'first-new-passphrase' }, `/reset?token=${token}`)
    const again = await client.submit('/reset', { token, password: 'second-new-passphrase', confirm: 'second-new-passphrase' }, `/reset?token=${token}`)
    expect(again.status).toBe(400)
    expect(again.body).toContain('expired or has already been used')
  })
})

describe('two step sign in through the site', () => {
  const nextCode = (secret: string) => codeAt(secret, Math.floor(Date.now() / 1000 / STEP_SECONDS) + 1)!

  async function enrol() {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })

    const page = await client.get('/account/two-factor')
    const secret = /name="secret" value="([^"]+)"/.exec(page.body)![1]!
    // Enrol with the current code, so the next one is still unspent for the
    // sign in below. A code is consumed by the step it proves.
    const done = await client.post('/account/two-factor', { secret, code: currentCode(secret)!, _csrf: page.token })
    const codes = [...done.body.matchAll(/<code class="secret">([A-Z0-9-]{11})<\/code>/g)].map((m) => m[1]!)
    return { client, email, secret, codes }
  }

  test('is offered as off, and turning it on requires a working code', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })

    expect((await client.get('/account')).body).toContain('It is off')

    const page = await client.get('/account/two-factor')
    const secret = /name="secret" value="([^"]+)"/.exec(page.body)![1]!
    const wrong = await client.post('/account/two-factor', { secret, code: '000000', _csrf: page.token })
    expect(wrong.status).toBe(422)
    expect((await database.repositories.users.byEmail(email))!.twoFactor).toBeUndefined()
  })

  test('shows recovery codes once when it is turned on', async () => {
    const { codes } = await enrol()
    expect(codes).toHaveLength(10)
  })

  test('holds the next sign in at the code step', async () => {
    const { email, secret } = await enrol()
    const client = browser()

    const signIn = await client.submit('/signin', { email, password: PASSWORD })
    expect(signIn.location).toBe('/signin/code')

    // The password alone opens nothing.
    const blocked = await client.get('/account')
    expect(blocked.status).toBe(303)
    expect(blocked.location).toContain('/signin')

    const code = await client.submit('/signin/code', { code: nextCode(secret) })
    expect(code.location).toBe('/account')
    expect((await client.get('/account')).status).toBe(200)
  })

  test('a wrong code does not complete the session', async () => {
    const { email } = await enrol()
    const client = browser()
    await client.submit('/signin', { email, password: PASSWORD })

    const response = await client.submit('/signin/code', { code: '000000' })
    expect(response.status).toBe(401)
    expect((await client.get('/account')).status).toBe(303)
  })

  test('a recovery code gets in when the app is not to hand', async () => {
    const { email, codes } = await enrol()
    const client = browser()
    await client.submit('/signin', { email, password: PASSWORD })

    expect((await client.submit('/signin/code', { recovery: codes[0]! })).location).toBe('/account')
  })
})

describe('the back office', () => {
  async function staffClient() {
    const email = `staff${Date.now()}${Math.random()}@marchmont.house`
    const member = await database.repositories.staff.add({
      name: 'Reviewer',
      email,
      passwordHash: await Bun.password.hash(PASSWORD, { algorithm: 'argon2id' }),
    })
    const client = browser()
    await client.submit('/staff/signin', { email, password: PASSWORD })
    return { client, member }
  }

  test('is closed to anyone not signed in as staff', async () => {
    const response = await browser().get('/staff/registrations')
    expect(response.status).toBe(303)
    expect(response.location).toBe('/staff/signin')
  })

  test('a registrant session does not reach it', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })

    const response = await client.get('/staff/registrations')
    expect(response.status).toBe(303)
    expect(response.location).toBe('/staff/signin')
  })

  test('a staff session does not become a registrant account', async () => {
    const { client } = await staffClient()
    const response = await client.get('/account')
    expect(response.status).toBe(303)
    expect(response.location).toContain('/signin')
  })

  test('shows the queue and approves, which writes to the trail and to the registrant', async () => {
    const registrant = browser()
    const { email } = await register(registrant)
    const user = (await database.repositories.users.byEmail(email))!

    const { client, member } = await staffClient()
    const queue = await client.get('/staff/people?status=pending')
    expect(queue.status).toBe(200)
    expect(queue.body).toContain(email)

    mail.clear()
    const decided = await client.post(`/staff/people/${user.id}/decide`, { decision: 'approve', _csrf: queue.token })
    expect(decided.location).toBe(`/staff/people/${user.id}`)

    expect((await database.repositories.users.byId(user.id))!.accountStatus).toBe('approved')
    expect(mail.lastTo(email)!.template).toBe('registration_approved')

    const trail = await database.repositories.audit.forSubject(`user:${user.id}`)
    expect(trail.find((entry) => entry.action === 'registration.approved')?.actor).toBe(`staff:${member.id}`)
  })

  test('declining records the reason and tells the registrant plainly', async () => {
    const registrant = browser()
    const { email } = await register(registrant)
    const user = (await database.repositories.users.byEmail(email))!

    const { client } = await staffClient()
    const queue = await client.get('/staff/people?status=pending')
    mail.clear()
    await client.post(`/staff/people/${user.id}/decide`, {
      decision: 'decline', reason: 'Outside the markets we hold stock in.', _csrf: queue.token,
    })

    const stored = (await database.repositories.users.byId(user.id))!
    expect(stored.accountStatus).toBe('declined')
    expect(stored.declineReason).toBe('Outside the markets we hold stock in.')
    expect(mail.lastTo(email)!.template).toBe('registration_declined')
  })

  test('a decision with no csrf token changes nothing', async () => {
    const registrant = browser()
    const { email } = await register(registrant)
    const user = (await database.repositories.users.byEmail(email))!

    const { client } = await staffClient()
    await client.post(`/staff/people/${user.id}/decide`, { decision: 'approve' })
    expect((await database.repositories.users.byId(user.id))!.accountStatus).toBe('pending')
  })
})

describe('gate 1, now that approval is reachable', () => {
  async function approvedClient() {
    const client = browser()
    const { email } = await register(client)
    const user = (await database.repositories.users.byEmail(email))!
    await database.repositories.users.decide(user.id, 'approved', { by: 'staff-test' })
    await client.submit('/signin', { email, password: PASSWORD })
    return { client, user }
  }

  test('an approved viewer gets the exact address and the figure', async () => {
    const offer = (await database.repositories.offers.live())[0]!
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const { client } = await approvedClient()
    const page = await client.get(`/portfolio/${offer.slug}`)

    expect(page.status).toBe(200)
    expect(page.body).toContain(property.address.formatted)
    expect(page.body).not.toContain('indicative')
  })

  test('an unapproved viewer gets a band and the district', async () => {
    const offer = (await database.repositories.offers.live())[0]!
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const page = await browser().get(`/portfolio/${offer.slug}`)
    expect(page.body).not.toContain(property.address.formatted)
    expect(page.body).toContain('indicative')
  })

  test('a registrant awaiting review is still an unapproved viewer', async () => {
    const client = browser()
    const { email } = await register(client)
    await client.submit('/signin', { email, password: PASSWORD })

    const offer = (await database.repositories.offers.live())[0]!
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const page = await client.get(`/portfolio/${offer.slug}`)
    expect(page.body).not.toContain(property.address.formatted)
    expect(page.body).toContain('indicative')
  })

  test('the approved viewer sees every photograph', async () => {
    const offer = (await database.repositories.offers.live())[0]!
    const { client } = await approvedClient()
    const page = await client.get(`/portfolio/${offer.slug}`)
    expect(page.body).not.toContain('Further photographs')
  })
})
