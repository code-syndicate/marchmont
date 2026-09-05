import { Router, type NextFunction, type Request, type Response } from 'express'
import { enrolmentUri } from '../security/totp'
import { noStore, type Context } from './context'

export function accountRoutes(ctx: Context): Router {
  const router = Router()
  const { accounts } = ctx

  /** Everything below here needs an account, and a stale link should land on sign in. */
  const signedIn = (req: Request, res: Response, next: NextFunction): void => {
    noStore(res)
    if (!res.locals.account) {
      res.redirect(303, `/signin?next=${encodeURIComponent(req.originalUrl)}`)
      return
    }
    next()
  }

  // Changing how you sign in requires having just proved you can. Enrolment is
  // not a standing permission.
  const recentlyProved = (req: Request, res: Response, next: NextFunction): void => {
    const account = res.locals.account
    if (account?.twoFactor && !accounts.isFresh(res.locals.session)) {
      res.redirect(303, `/signin/code?next=${encodeURIComponent(req.originalUrl)}`)
      return
    }
    next()
  }

  router.get('/account', signedIn, (req, res) => {
    const account = res.locals.account
    res.render('account/index', {
      nav: 'account',
      title: 'Your account',
      description: 'Your registration, its status, and how you sign in.',
      account,
      verificationSent: req.query.sent === '1',
      twoFactorOn: Boolean(account.twoFactor),
    })
  })

  router.get('/account/two-factor', signedIn, recentlyProved, (_req, res) => {
    const account = res.locals.account
    if (account.twoFactor) return res.redirect(303, '/account')

    // Held in the form rather than the database, so an abandoned enrolment
    // leaves nothing behind and a half-set secret can never be the live one.
    const { secret } = accounts.beginTwoFactorEnrolment(account)
    res.render('account/two-factor', {
      nav: 'account',
      title: 'Set up two step sign in',
      description: 'Add a code from an authenticator app to your sign in.',
      secret,
      uri: enrolmentUri(secret, account.email),
      errors: {},
    })
  })

  router.post('/account/two-factor', signedIn, recentlyProved, async (req, res, next) => {
    try {
      noStore(res)
      const account = res.locals.account
      const body = (req.body ?? {}) as Record<string, unknown>
      const secret = typeof body.secret === 'string' ? body.secret : ''
      const code = typeof body.code === 'string' ? body.code : ''

      if (!ctx.tokenAccepted(req) || !ctx.withinRate(req)) {
        return res.redirect(303, '/account/two-factor')
      }

      const codes = await accounts.completeTwoFactorEnrolment(account, secret, code)
      if (!codes) {
        return res.status(422).render('account/two-factor', {
          nav: 'account',
          title: 'Set up two step sign in',
          description: 'Add a code from an authenticator app to your sign in.',
          secret,
          uri: enrolmentUri(secret, account.email),
          errors: { code: 'That code is not right. Check your app and try the current one.' },
        })
      }

      res.render('account/recovery', {
        nav: 'account',
        title: 'Your recovery codes',
        description: 'Keep these somewhere safe. Each one can be used once.',
        codes,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/account/two-factor/off', signedIn, recentlyProved, async (req, res, next) => {
    try {
      if (!ctx.tokenAccepted(req)) return res.redirect(303, '/account')
      if (res.locals.account.twoFactor) await accounts.disableTwoFactor(res.locals.account)
      res.redirect(303, '/account')
    } catch (error) {
      next(error)
    }
  })

  return router
}
