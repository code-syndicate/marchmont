import { Router, type NextFunction, type Request, type Response } from 'express'
import { noStore, type Context } from './context'
import { SESSION_COOKIE } from './auth'

export function staffRoutes(ctx: Context): Router {
  const router = Router()
  const { accounts, database, sessionCookie } = ctx

  const onlyStaff = (req: Request, res: Response, next: NextFunction): void => {
    noStore(res)
    if (!res.locals.staff) {
      res.redirect(303, '/staff/signin')
      return
    }
    next()
  }

  router.get('/staff/signin', (_req, res) => {
    noStore(res)
    if (res.locals.staff) return res.redirect(303, '/staff/registrations')
    res.render('staff/signin', { nav: '', title: 'Staff sign in', description: 'Sign in to the Marchmont back office.', values: {}, layout: 'staff' })
  })

  router.post('/staff/signin', async (req, res, next) => {
    try {
      noStore(res)
      const body = (req.body ?? {}) as Record<string, unknown>
      const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      const data = { nav: '', title: 'Staff sign in', description: 'Sign in to the Marchmont back office.', values: { email } }

      if (!ctx.tokenAccepted(req) || !ctx.withinRate(req, 'staff-signin')) {
        return res.status(403).render('staff/signin', { ...data, formError: 'Please submit the form again.' })
      }

      const attemptKey = `staff-signin:${email}`
      if ((await database.repositories.attempts.record(attemptKey, 15 * 60 * 1000)) > 10) {
        await database.repositories.audit.append({ actor: `anonymous:${req.ip ?? 'unknown'}`, action: 'staff.signin.rate_limited', subject: `staff_email:${email}` })
        return res.status(429).render('staff/signin', { ...data, formError: 'Too many sign in attempts. Try again in a few minutes.' })
      }

      const member = await database.repositories.staff.byEmail(email)
      const hash = member?.passwordHash ?? '$argon2id$v=19$m=65536,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const correct = await Bun.password.verify(password, hash).catch(() => false)

      if (!member || !correct) {
        await database.repositories.audit.append({
          actor: `anonymous:${req.ip ?? 'unknown'}`,
          action: 'staff.signin.failed',
          subject: `staff_email:${email}`,
        })
        return res.status(401).render('staff/signin', { ...data, formError: 'That email address and password do not match.' })
      }

      await database.repositories.attempts.clear(attemptKey)
      const session = await database.repositories.sessions.open({
        principal: 'staff',
        subjectId: member.id,
        lifetimeMs: 8 * 60 * 60 * 1000,
        twoFactorAt: new Date(),
      })
      await database.repositories.audit.append({ actor: `staff:${member.id}`, action: 'staff.signin.succeeded', subject: `staff:${member.id}` })

      sessionCookie(res, session.id)
      res.redirect(303, '/staff/registrations')
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/registrations', onlyStaff, async (_req, res, next) => {
    try {
      const [queue, counts] = await Promise.all([
        database.repositories.users.awaitingReview(),
        database.repositories.users.countByStatus(),
      ])
      res.render('staff/registrations', {
        nav: '',
        title: 'Registrations',
        description: 'Registrations awaiting review.',
        queue,
        counts,
        staff: res.locals.staff,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/staff/registrations/:id/decide', onlyStaff, async (req, res, next) => {
    try {
      if (!ctx.tokenAccepted(req)) return res.redirect(303, '/staff/registrations')

      const body = (req.body ?? {}) as Record<string, unknown>
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : null
      if (!decision) return res.redirect(303, '/staff/registrations')

      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
      await accounts.decide({
        userId: String(req.params.id),
        status: decision,
        staffId: res.locals.staff.id,
        ...(decision === 'declined' && reason ? { reason } : {}),
      })

      res.redirect(303, '/staff/registrations')
    } catch (error) {
      next(error)
    }
  })

  router.post('/staff/signout', async (req, res, next) => {
    try {
      if (!ctx.tokenAccepted(req)) return res.redirect(303, '/staff/registrations')
      if (res.locals.session?.principal === 'staff') await accounts.signOut(res.locals.session.id)
      res.clearCookie(SESSION_COOKIE, { path: '/' })
      res.redirect(303, '/staff/signin')
    } catch (error) {
      next(error)
    }
  })

  return router
}
