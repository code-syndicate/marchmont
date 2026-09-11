import { Router, type Request } from 'express'
import { validateEnquiry, validateRegistration } from '../domain/submissions'
import { PASSWORD_MESSAGE } from '../domain/passwords'
import { localeFor, type Context } from './context'

export function formRoutes(ctx: Context): Router {
  const router = Router()
  const { accounts, database, portfolio, images } = ctx
  const tokenAccepted = (req: Request) => ctx.tokenAccepted(req)
  const withinRate = (req: Request) => ctx.withinRate(req)

  async function registerPage(req: Request, extra: Record<string, unknown> = {}) {
    const locale = localeFor(req)
    const listings = await portfolio.list({}, locale)
    const countries = [...new Map(listings.map((l) => [l.countryCode, l.country])).entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
    return {
      nav: 'register',
      title: 'Register an interest',
      description:
        'Register your requirement with Nash Luxury Realty. Approval opens exact addresses, full terms, floor plans and supporting documentation.',
      offer: typeof req.query.offer === 'string' ? req.query.offer : null,
      hero: images.render(
        { id: 'villa-study', alt: 'Study with a curved oak desk and lit shelving, looking onto the garden' },
        'hero',
        '100vw',
      ),
      countries,
      errors: {},
      values: {},
      ...extra,
    }
  }

  router.get('/register', async (req, res, next) => {
    try {
      res.render('register', await registerPage(req))
    } catch (error) {
      next(error)
    }
  })

  router.post('/register', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      if (!withinRate(req)) {
        return res.status(429).render('register', await registerPage(req, {
          values: body,
          formError: 'Too many registrations have been sent from this connection. Please try again shortly.',
        }))
      }
      if (!tokenAccepted(req)) {
        return res.status(403).render('register', await registerPage(req, {
          values: body,
          formError: 'Your session expired before the form was sent. Please submit it again.',
        }))
      }

      const result = validateRegistration(body)
      if (!result.ok) {
        return res.status(422).render('register', await registerPage(req, {
          values: body,
          errors: result.errors,
          formError: 'Check the highlighted fields and submit again.',
        }))
      }

      const password = typeof body.password === 'string' ? body.password : ''
      const problem = accounts.checkPassword(password, result.value.email)
      if (problem) {
        return res.status(422).render('register', await registerPage(req, {
          values: body,
          errors: { password: PASSWORD_MESSAGE[problem] },
          formError: 'Check the highlighted fields and submit again.',
        }))
      }

      const outcome = await database.repositories.users.register(result.value)

      // A second registration for a known address neither overwrites the
      // account nor says that it exists. Both paths render the same page.
      if (outcome.status === 'registered') {
        await database.repositories.users.setPassword(outcome.id, await accounts.hashPassword(password))
        await accounts.startRegistration(outcome.id, result.value.email, result.value.name)
      }

      await database.repositories.audit.append({
        actor: `registrant:${outcome.id}`,
        action: outcome.status === 'registered' ? 'registration.submitted' : 'registration.duplicate',
        subject: `user:${outcome.id}`,
        detail: { intent: result.value.intent, market: result.value.market ?? null, offer: result.value.offer ?? null },
      })

      res.redirect(303, '/register/received')
    } catch (error) {
      next(error)
    }
  })

  router.get('/register/received', (_req, res) => {
    res.render('received', {
      nav: 'register',
      title: 'Registration received',
      description: 'Your registration has been received and is with a member of staff for review.',
      heading: 'Registration received',
      lede: 'Your registration is with a member of staff for review.',
      body: [
        'You will have a response within two working days, either approving your registration or confirming that we are unable to assist.',
        'Approval opens exact addresses, full terms, floor plans and supporting documentation across the portfolio, and allows you to arrange a viewing. No payment is requested at registration, or at any point before an application has been approved in writing.',
      ],
      action: { href: '/portfolio', label: 'Back to the portfolio' },
    })
  })

  function contactPage(extra: Record<string, unknown> = {}) {
    return {
      nav: 'contact',
      title: 'Contact',
      description: 'Contact Nash Luxury Realty about a specific building or a general requirement. Registrations are reviewed within two working days.',
      hero: images.render(
        { id: 'villa-entrance-hall', alt: 'Entrance hall with a floating stair and an indoor planted garden' },
        'hero',
        '100vw',
      ),
      errors: {},
      values: {},
      ...extra,
    }
  }

  router.get('/contact', (_req, res) => {
    res.render('contact', contactPage())
  })

  router.post('/contact', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      if (!withinRate(req)) {
        return res.status(429).render('contact', contactPage({
          values: body,
          formError: 'Too many messages have been sent from this connection. Please try again shortly.',
        }))
      }
      if (!tokenAccepted(req)) {
        return res.status(403).render('contact', contactPage({
          values: body,
          formError: 'Your session expired before the form was sent. Please submit it again.',
        }))
      }

      const result = validateEnquiry(body)
      if (!result.ok) {
        return res.status(422).render('contact', contactPage({
          values: body,
          errors: result.errors,
          formError: 'Check the highlighted fields and submit again.',
        }))
      }

      const offer = typeof body.offer === 'string' && body.offer.trim() ? body.offer.trim() : undefined
      const id = await database.repositories.enquiries.record({ ...result.value, ...(offer ? { offer } : {}) })
      await database.repositories.audit.append({
        actor: `enquirer:${id}`,
        action: 'enquiry.received',
        subject: `enquiry:${id}`,
        detail: { offer: offer ?? null },
      })

      res.redirect(303, '/contact/received')
    } catch (error) {
      next(error)
    }
  })

  router.get('/contact/received', (_req, res) => {
    res.render('received', {
      nav: 'contact',
      title: 'Message sent',
      description: 'Your message has been received.',
      heading: 'Message sent',
      lede: 'Your message has reached the office.',
      body: [
        'Enquiries are answered within two working days by the member of staff responsible for the building concerned.',
        'If your enquiry is about arranging a viewing or seeing full terms, registering an interest is the faster route, since approval opens that material across the portfolio.',
      ],
      action: { href: '/register', label: 'Register an interest' },
    })
  })

  return router
}
