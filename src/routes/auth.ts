import { Router, type Request, type Response } from 'express'
import { PASSWORD_MESSAGE } from '../domain/passwords'
import { noStore, type Context } from './context'

export const SESSION_COOKIE = 'mc_session'

type Fields = Record<string, unknown>

const text = (body: Fields, key: string): string =>
  typeof body[key] === 'string' ? (body[key] as string).trim() : ''

export function authRoutes(ctx: Context): Router {
  const router = Router()
  const { accounts, database, sessionCookie } = ctx

  const page = (extra: Record<string, unknown> = {}) => ({ errors: {}, values: {}, ...extra })

  const guard = async (req: Request, res: Response, view: string, data: Record<string, unknown>): Promise<boolean> => {
    if (!ctx.withinRate(req)) {
      res.status(429).render(view, page({ ...data, formError: 'Too many attempts from this connection. Please try again shortly.' }))
      return false
    }
    if (!ctx.tokenAccepted(req)) {
      res.status(403).render(view, page({ ...data, formError: 'Your session expired before the form was sent. Please submit it again.' }))
      return false
    }
    return true
  }

  // ---- sign in ----

  router.get('/signin', (req, res) => {
    noStore(res)
    if (res.locals.account) return res.redirect(303, '/account')
    res.render('auth/signin', page({
      nav: 'signin',
      title: 'Sign in',
      description: 'Sign in to your Nash Luxury Realty account.',
      next: typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '',
    }))
  })

  router.post('/signin', async (req, res, next) => {
    try {
      noStore(res)
      const body = (req.body ?? {}) as Fields
      const values = { email: text(body, 'email') }
      const data = { nav: 'signin', title: 'Sign in', description: 'Sign in to your Nash Luxury Realty account.', values, next: text(body, 'next') }
      if (!(await guard(req, res, 'auth/signin', data))) return

      const result = await accounts.signIn({
        email: values.email.toLowerCase(),
        password: typeof body.password === 'string' ? body.password : '',
        ip: req.ip ?? 'unknown',
        ...(req.headers['user-agent'] ? { userAgent: String(req.headers['user-agent']) } : {}),
      })

      if (result.outcome === 'rate_limited') {
        return res.status(429).render('auth/signin', page({ ...data, formError: 'Too many sign in attempts. Please try again in a few minutes.' }))
      }
      // One message for a wrong password and for an address with no account.
      // Telling them apart is a way to find out who is registered.
      if (result.outcome === 'rejected') {
        return res.status(401).render('auth/signin', page({ ...data, formError: 'That email address and password do not match.' }))
      }

      sessionCookie(res, result.session.id)
      const destination = text(body, 'next').startsWith('/') ? text(body, 'next') : '/account'
      res.redirect(303, result.outcome === 'two_factor_required' ? '/signin/code' : destination)
    } catch (error) {
      next(error)
    }
  })

  // ---- the code step ----

  router.get('/signin/code', (req, res) => {
    noStore(res)
    if (!res.locals.session) return res.redirect(303, '/signin')
    if (res.locals.account) return res.redirect(303, '/account')
    res.render('auth/code', page({ nav: 'signin', title: 'Enter your code', description: 'Enter the code from your authenticator app.' }))
  })

  router.post('/signin/code', async (req, res, next) => {
    try {
      noStore(res)
      const session = res.locals.session
      if (!session) return res.redirect(303, '/signin')

      const data = { nav: 'signin', title: 'Enter your code', description: 'Enter the code from your authenticator app.' }
      if (!(await guard(req, res, 'auth/code', data))) return

      const body = (req.body ?? {}) as Fields
      const recovery = text(body, 'recovery')
      const accepted = recovery
        ? await accounts.presentRecoveryCode(session, recovery)
        : await accounts.presentCode(session, text(body, 'code'))

      if (!accepted) {
        return res.status(401).render('auth/code', page({ ...data, formError: 'That code is not right, or it has already been used.' }))
      }
      res.redirect(303, '/account')
    } catch (error) {
      next(error)
    }
  })

  router.post('/signout', async (req, res, next) => {
    try {
      if (!ctx.tokenAccepted(req)) return res.redirect(303, '/')
      if (res.locals.session) await accounts.signOut(res.locals.session.id)
      res.clearCookie(SESSION_COOKIE, { path: '/' })
      res.redirect(303, '/')
    } catch (error) {
      next(error)
    }
  })

  // ---- verification ----

  router.get('/verify', async (req, res, next) => {
    try {
      noStore(res)
      const token = typeof req.query.token === 'string' ? req.query.token : ''
      const user = token ? await accounts.verifyEmail(token) : null
      res.status(user ? 200 : 400).render('auth/verified', {
        nav: '',
        title: user ? 'Email address confirmed' : 'That link has expired',
        description: user ? 'Your email address has been confirmed.' : 'This confirmation link is no longer valid.',
        confirmed: Boolean(user),
        status: user?.accountStatus ?? null,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/verify/resend', async (req, res, next) => {
    try {
      if (!ctx.tokenAccepted(req) || !ctx.withinRate(req)) return res.redirect(303, '/account')
      const user = res.locals.account
      if (user && !user.emailVerifiedAt) await accounts.startRegistration(user.id, user.email, user.name)
      res.redirect(303, '/account?sent=1')
    } catch (error) {
      next(error)
    }
  })

  // ---- password reset ----

  router.get('/forgotten', (_req, res) => {
    noStore(res)
    res.render('auth/forgotten', page({ nav: '', title: 'Reset your password', description: 'Ask for a link to set a new password.' }))
  })

  router.post('/forgotten', async (req, res, next) => {
    try {
      noStore(res)
      const body = (req.body ?? {}) as Fields
      const data = { nav: '', title: 'Reset your password', description: 'Ask for a link to set a new password.', values: { email: text(body, 'email') } }
      if (!(await guard(req, res, 'auth/forgotten', data))) return

      await accounts.requestPasswordReset(text(body, 'email').toLowerCase())
      // The same page either way. Which addresses are registered is not
      // something this form is willing to answer.
      res.redirect(303, '/forgotten/sent')
    } catch (error) {
      next(error)
    }
  })

  router.get('/forgotten/sent', (_req, res) => {
    noStore(res)
    res.render('received', {
      nav: '',
      title: 'Check your email',
      description: 'If that address has an account, a reset link is on its way.',
      heading: 'Check your email',
      lede: 'If that address has an account with us, a link to set a new password is on its way.',
      body: [
        'The link is good for one hour and can be used once. Asking again replaces any earlier link.',
        'If nothing arrives, check the address you entered and look in your spam folder.',
      ],
      action: { href: '/signin', label: 'Back to sign in' },
    })
  })

  router.get('/reset', (req, res) => {
    noStore(res)
    res.render('auth/reset', page({
      nav: '',
      title: 'Set a new password',
      description: 'Choose a new password for your account.',
      token: typeof req.query.token === 'string' ? req.query.token : '',
    }))
  })

  router.post('/reset', async (req, res, next) => {
    try {
      noStore(res)
      const body = (req.body ?? {}) as Fields
      const token = text(body, 'token')
      const data = { nav: '', title: 'Set a new password', description: 'Choose a new password for your account.', token }
      if (!(await guard(req, res, 'auth/reset', data))) return

      const password = typeof body.password === 'string' ? body.password : ''
      const problem = accounts.checkPassword(password)
      if (problem) {
        return res.status(422).render('auth/reset', page({ ...data, errors: { password: PASSWORD_MESSAGE[problem] } }))
      }
      if (password !== text(body, 'confirm')) {
        return res.status(422).render('auth/reset', page({ ...data, errors: { confirm: 'Both passwords must match.' } }))
      }

      const user = await accounts.completePasswordReset(token, password)
      if (!user) {
        return res.status(400).render('auth/reset', page({
          ...data,
          formError: 'This link has expired or has already been used. Ask for a new one.',
        }))
      }
      res.clearCookie(SESSION_COOKIE, { path: '/' })
      res.redirect(303, '/signin?reset=1')
    } catch (error) {
      next(error)
    }
  })

  return router
}
