import { Router, type NextFunction, type Request, type Response } from 'express'
import { MAX_PROPOSED_TIMES, VIEWING_LABEL, canMoveViewing } from '../domain/threads'
import { localeFor, noStore, type Context } from './context'

const text = (body: Record<string, unknown>, key: string, max = 4000): string =>
  typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : ''

export function enquiryRoutes(ctx: Context): Router {
  const router = Router()
  const { enquiries, database, portfolio } = ctx

  const signedIn = (req: Request, res: Response, next: NextFunction): void => {
    noStore(res)
    if (!res.locals.account) {
      res.redirect(303, `/signin?next=${encodeURIComponent(req.originalUrl)}`)
      return
    }
    // A declined account keeps its history but cannot start anything new.
    next()
  }

  const canStart = (res: Response): boolean => res.locals.account?.accountStatus !== 'declined'

  router.get('/account/enquiries', signedIn, async (_req, res, next) => {
    try {
      const account = res.locals.account
      const [threads, viewings, properties, offers] = await Promise.all([
        database.repositories.threads.forRegistrant(account.id),
        database.repositories.viewings.forRegistrant(account.id),
        database.repositories.properties.all(),
        database.repositories.offers.everything(),
      ])

      // A viewing time is an instant. Showing it in the viewer's own zone would
      // tell them when to arrive somewhere they are not, so it is shown in the
      // building's.
      const propertyBySlug = new Map(offers.map((offer) => [offer.slug, offer.propertyId]))
      const zoneById = new Map(properties.map((property) => [property.id, property.timeZone ?? 'UTC']))

      res.render('account/enquiries', {
        nav: 'account',
        title: 'Your enquiries',
        description: 'Your enquiries and viewing requests.',
        threads,
        viewings: viewings.map((viewing) => ({
          ...viewing,
          timeZone: zoneById.get(propertyBySlug.get(viewing.offerSlug) ?? '') ?? 'UTC',
        })),
        viewingLabel: VIEWING_LABEL,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/account/enquiries/:id', signedIn, async (req, res, next) => {
    try {
      const account = res.locals.account
      const thread = await database.repositories.threads.byId(String(req.params.id))
      if (!thread || thread.registrantId !== account.id) return next()

      res.render('account/thread', {
        nav: 'account',
        title: thread.subject,
        description: `Your enquiry about ${thread.offerName}.`,
        thread,
        canReply: canStart(res) && !thread.closedAt,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/portfolio/:slug/enquire', signedIn, async (req, res, next) => {
    try {
      const account = res.locals.account
      if (!ctx.tokenAccepted(req) || !ctx.withinRate(req, 'enquire') || !canStart(res)) {
        return res.redirect(303, `/portfolio/${req.params.slug}`)
      }

      const listing = await portfolio.detail(String(req.params.slug), localeFor(req), res.locals.viewer)
      if (!listing) return next()

      const body = (req.body ?? {}) as Record<string, unknown>
      const message = text(body, 'message')
      if (message.length < 10) return res.redirect(303, `/portfolio/${req.params.slug}?enquiry=short`)

      const thread = await enquiries.openThread({
        offerSlug: listing.slug,
        offerName: `${listing.name}, ${listing.locality}`,
        registrant: { id: account.id, name: account.name },
        subject: text(body, 'subject', 140) || `Enquiry about ${listing.name}`,
        body: message,
      })
      res.redirect(303, `/account/enquiries/${thread.id}`)
    } catch (error) {
      next(error)
    }
  })

  router.post('/account/enquiries/:id/reply', signedIn, async (req, res, next) => {
    try {
      const account = res.locals.account
      const thread = await database.repositories.threads.byId(String(req.params.id))
      if (!thread || thread.registrantId !== account.id) return next()

      if (ctx.tokenAccepted(req) && ctx.withinRate(req, 'enquire') && canStart(res) && !thread.closedAt) {
        const message = text((req.body ?? {}) as Record<string, unknown>, 'message')
        if (message.length >= 2) {
          await enquiries.reply({
            threadId: thread.id,
            from: 'registrant',
            authorId: account.id,
            authorName: account.name,
            body: message,
          })
        }
      }
      res.redirect(303, `/account/enquiries/${thread.id}`)
    } catch (error) {
      next(error)
    }
  })

  router.post('/portfolio/:slug/viewing', signedIn, async (req, res, next) => {
    try {
      const account = res.locals.account
      if (!ctx.tokenAccepted(req) || !ctx.withinRate(req, 'viewing') || !canStart(res)) {
        return res.redirect(303, `/portfolio/${req.params.slug}`)
      }

      const listing = await portfolio.detail(String(req.params.slug), localeFor(req), res.locals.viewer)
      if (!listing) return next()

      const body = (req.body ?? {}) as Record<string, unknown>
      const times = Array.from({ length: MAX_PROPOSED_TIMES }, (_unused, index) => text(body, `time${index + 1}`, 40))
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))

      const viewing = await enquiries.requestViewing({
        offerSlug: listing.slug,
        offerName: `${listing.name}, ${listing.locality}`,
        registrantId: account.id,
        times,
        ...(text(body, 'note', 500) ? { note: text(body, 'note', 500) } : {}),
      })

      res.redirect(303, viewing ? '/account/enquiries' : `/portfolio/${req.params.slug}?viewing=times`)
    } catch (error) {
      next(error)
    }
  })

  router.post('/account/viewings/:id/withdraw', signedIn, async (req, res, next) => {
    try {
      if (ctx.tokenAccepted(req)) {
        await enquiries.withdrawViewing(String(req.params.id), res.locals.account.id)
      }
      res.redirect(303, '/account/enquiries')
    } catch (error) {
      next(error)
    }
  })

  return router
}

export { canMoveViewing }
