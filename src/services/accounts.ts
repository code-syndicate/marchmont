import type { Repositories } from '../db/repositories'
import type { AccountStatus, Registrant } from '../db/repositories/users'
import type { Session } from '../db/repositories/sessions'
import type { MailProvider } from '../providers/mail'
import { checkPassword, type PasswordProblem } from '../domain/passwords'
import { hashToken, issueRecoveryCodes, issueToken } from '../security/tokens'
import { generateSecret, verifyCode } from '../security/totp'

export const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000
export const VERIFY_LIFETIME_MS = 48 * 60 * 60 * 1000
export const RESET_LIFETIME_MS = 60 * 60 * 1000

/** A fresh code is required this recently before anything sensitive. */
export const TWO_FACTOR_FRESHNESS_MS = 10 * 60 * 1000

/**
 * Only failures are counted. Counting every attempt would mean a shared office
 * address locking everyone behind it out after a handful of ordinary sign ins.
 */
const SIGN_IN_LIMIT_PER_EMAIL = 10
// Higher, because one address can legitimately carry a whole building.
const SIGN_IN_LIMIT_PER_IP = 50
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000

export type SignInResult =
  | { outcome: 'signed_in'; session: Session; user: Registrant }
  | { outcome: 'two_factor_required'; session: Session; user: Registrant }
  | { outcome: 'rejected' }
  | { outcome: 'rate_limited' }

export type Accounts = {
  hashPassword(password: string): Promise<string>
  checkPassword(password: string, email?: string): PasswordProblem | null
  startRegistration(userId: string, email: string, name: string): Promise<void>
  verifyEmail(raw: string): Promise<Registrant | null>
  signIn(input: { email: string; password: string; ip: string; userAgent?: string }): Promise<SignInResult>
  presentCode(session: Session, code: string): Promise<boolean>
  presentRecoveryCode(session: Session, code: string): Promise<boolean>
  signOut(sessionId: string): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  completePasswordReset(raw: string, password: string): Promise<Registrant | null>
  beginTwoFactorEnrolment(user: Registrant): { secret: string }
  completeTwoFactorEnrolment(user: Registrant, secret: string, code: string): Promise<string[] | null>
  disableTwoFactor(user: Registrant): Promise<void>
  isFresh(session: Session, now?: number): boolean
  decide(input: { userId: string; status: Exclude<AccountStatus, 'pending'>; staffId: string; reason?: string }): Promise<Registrant | null>
}

export function createAccounts(deps: {
  repositories: Repositories
  mail: MailProvider
  publicUrl: string
}): Accounts {
  const { repositories, mail, publicUrl } = deps
  const { users, sessions, credentials, audit, attempts } = repositories

  const link = (path: string, token: string): string =>
    new URL(`${path}?token=${encodeURIComponent(token)}`, publicUrl).toString()

  const sendVerification = async (userId: string, email: string, name: string): Promise<void> => {
    await credentials.revokeAllFor(userId, 'verify_email')
    const token = issueToken()
    await credentials.issue({ hash: token.hash, purpose: 'verify_email', userId, lifetimeMs: VERIFY_LIFETIME_MS })
    await mail.send({
      to: email,
      template: 'verify_email',
      subject: 'Confirm your email address',
      lines: [
        `${name},`,
        'Confirm this address so we can reach you about your registration. The link is good for two days.',
        'A member of staff reviews every registration separately. Confirming the address does not approve the account.',
      ],
      action: { label: 'Confirm this address', url: link('/verify', token.raw) },
    })
  }

  return {
    hashPassword: (password) => Bun.password.hash(password, { algorithm: 'argon2id' }),

    checkPassword,

    startRegistration: (userId, email, name) => sendVerification(userId, email, name),

    async verifyEmail(raw) {
      const credential = await credentials.spend(hashToken(raw), 'verify_email')
      if (!credential) return null

      const user = await users.byId(credential.userId)
      if (!user) return null

      await users.markEmailVerified(user.id)
      await audit.append({ actor: `registrant:${user.id}`, action: 'email.verified', subject: `user:${user.id}` })
      return { ...user, emailVerifiedAt: new Date() }
    },

    async signIn({ email, password, ip, userAgent }) {
      const emailKey = `signin:email:${email}`
      const ipKey = `signin:ip:${ip}`

      // Read before spending: an attempt is only counted once it has failed, so
      // neither one account nor one source can be worked through at leisure and
      // ordinary use does not accumulate against either.
      const [emailFailures, ipFailures] = await Promise.all([attempts.count(emailKey), attempts.count(ipKey)])
      if (emailFailures >= SIGN_IN_LIMIT_PER_EMAIL || ipFailures >= SIGN_IN_LIMIT_PER_IP) {
        await audit.append({ actor: `anonymous:${ip}`, action: 'signin.rate_limited', subject: `email:${email}` })
        return { outcome: 'rate_limited' }
      }

      const user = await users.byEmail(email)

      // Hashing regardless of whether the account exists, so the response time
      // does not say which addresses are registered.
      const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const correct = await Bun.password.verify(password, hash).catch(() => false)

      if (!user || !user.passwordHash || !correct) {
        await Promise.all([
          attempts.record(emailKey, SIGN_IN_WINDOW_MS),
          attempts.record(ipKey, SIGN_IN_WINDOW_MS),
        ])
        await audit.append({
          actor: `anonymous:${ip}`,
          action: 'signin.failed',
          subject: `email:${email}`,
          detail: { reason: !user ? 'no_account' : !user.passwordHash ? 'no_password_set' : 'wrong_password' },
        })
        return { outcome: 'rejected' }
      }

      // Only the address is cleared. Clearing the source too would let anyone
      // with one working account reset the counter for the whole address.
      await attempts.clear(emailKey)

      const twoFactorOn = Boolean(user.twoFactor)
      const session = await sessions.open({
        principal: 'registrant',
        subjectId: user.id,
        lifetimeMs: SESSION_LIFETIME_MS,
        ...(twoFactorOn ? {} : { twoFactorAt: new Date() }),
        ...(userAgent ? { userAgent } : {}),
      })

      await audit.append({
        actor: `registrant:${user.id}`,
        action: twoFactorOn ? 'signin.password_accepted' : 'signin.succeeded',
        subject: `user:${user.id}`,
      })

      return { outcome: twoFactorOn ? 'two_factor_required' : 'signed_in', session, user }
    },

    async presentCode(session, code) {
      const user = await users.byId(session.subjectId)
      if (!user?.twoFactor) return false

      const step = verifyCode(user.twoFactor.secret, code)
      // A code stays valid for its whole window, so the step it matched is
      // recorded and a repeat of the same step is refused.
      if (step === null || (user.twoFactor.lastStep !== undefined && step <= user.twoFactor.lastStep)) {
        await audit.append({ actor: `registrant:${user.id}`, action: 'two_factor.failed', subject: `user:${user.id}` })
        return false
      }

      await users.recordTwoFactorStep(user.id, step)
      await sessions.markTwoFactor(session.id)
      await audit.append({ actor: `registrant:${user.id}`, action: 'two_factor.accepted', subject: `user:${user.id}` })
      return true
    },

    async presentRecoveryCode(session, code) {
      const user = await users.byId(session.subjectId)
      if (!user?.twoFactor) return false

      const spent = await users.spendRecoveryCode(user.id, hashToken(code.trim().toUpperCase()))
      if (!spent) {
        await audit.append({ actor: `registrant:${user.id}`, action: 'recovery_code.failed', subject: `user:${user.id}` })
        return false
      }

      await sessions.markTwoFactor(session.id)
      await audit.append({ actor: `registrant:${user.id}`, action: 'recovery_code.spent', subject: `user:${user.id}` })
      return true
    },

    async signOut(sessionId) {
      const session = await sessions.find(sessionId)
      await sessions.close(sessionId)
      if (session) {
        await audit.append({
          actor: `${session.principal}:${session.subjectId}`,
          action: 'signout',
          subject: `${session.principal === 'staff' ? 'staff' : 'user'}:${session.subjectId}`,
        })
      }
    },

    // Says nothing about whether the address is registered. The caller always
    // renders the same page.
    async requestPasswordReset(email) {
      const user = await users.byEmail(email)
      if (!user) return

      await credentials.revokeAllFor(user.id, 'password_reset')
      const token = issueToken()
      await credentials.issue({ hash: token.hash, purpose: 'password_reset', userId: user.id, lifetimeMs: RESET_LIFETIME_MS })
      await audit.append({ actor: `registrant:${user.id}`, action: 'password_reset.requested', subject: `user:${user.id}` })

      await mail.send({
        to: user.email,
        template: 'password_reset',
        subject: 'Reset your password',
        lines: [
          `${user.name},`,
          'Use the link below to set a new password. It is good for one hour and can be used once.',
          'If you did not ask for this, nothing has changed and you can ignore this message.',
        ],
        action: { label: 'Set a new password', url: link('/reset', token.raw) },
      })
    },

    async completePasswordReset(raw, password) {
      const credential = await credentials.spend(hashToken(raw), 'password_reset')
      if (!credential) return null

      const user = await users.byId(credential.userId)
      if (!user) return null

      await users.setPassword(user.id, await Bun.password.hash(password, { algorithm: 'argon2id' }))
      // Whoever asked for the reset may not be whoever held the old session.
      const closed = await sessions.closeAllFor('registrant', user.id)
      await audit.append({
        actor: `registrant:${user.id}`,
        action: 'password_reset.completed',
        subject: `user:${user.id}`,
        detail: { sessionsClosed: closed },
      })
      return user
    },

    beginTwoFactorEnrolment: () => ({ secret: generateSecret() }),

    // Enrolment is only real once a code from the app has been shown to work,
    // so a mistyped secret cannot lock someone out of their own account.
    async completeTwoFactorEnrolment(user, secret, code) {
      const step = verifyCode(secret, code)
      if (step === null) return null

      const recovery = issueRecoveryCodes()
      await users.enrolTwoFactor(user.id, {
        secret,
        enrolledAt: new Date(),
        recoveryHashes: recovery.hashes,
        lastStep: step,
      })
      await audit.append({ actor: `registrant:${user.id}`, action: 'two_factor.enrolled', subject: `user:${user.id}` })
      return recovery.raw
    },

    async disableTwoFactor(user) {
      await users.disableTwoFactor(user.id)
      await audit.append({ actor: `registrant:${user.id}`, action: 'two_factor.disabled', subject: `user:${user.id}` })
    },

    isFresh(session, now = Date.now()) {
      if (!session.twoFactorAt) return false
      return now - session.twoFactorAt.getTime() <= TWO_FACTOR_FRESHNESS_MS
    },

    async decide({ userId, status, staffId, reason }) {
      const decided = await users.decide(userId, status, { by: staffId, ...(reason ? { reason } : {}) })
      if (!decided) return null

      await audit.append({
        actor: `staff:${staffId}`,
        action: status === 'approved' ? 'registration.approved' : 'registration.declined',
        subject: `user:${userId}`,
        ...(reason ? { detail: { reason } } : {}),
      })

      await mail.send({
        to: decided.email,
        template: status === 'approved' ? 'registration_approved' : 'registration_declined',
        subject: status === 'approved' ? 'Your registration has been approved' : 'About your registration',
        lines:
          status === 'approved'
            ? [
                `${decided.name},`,
                'Your registration has been approved. Signing in now opens exact addresses, full terms and the complete gallery across the portfolio, and lets you arrange a viewing.',
              ]
            : [
                `${decided.name},`,
                'We are not able to take your registration forward at this time.',
                reason ?? 'No payment was taken and no details have been shared with anyone else.',
              ],
        ...(status === 'approved' ? { action: { label: 'Sign in', url: new URL('/signin', publicUrl).toString() } } : {}),
      })

      return decided
    },
  }
}
