import { Router, type NextFunction, type Request, type Response } from 'express'
import { OFFER_STATUSES, STATUS_LABEL, nextStatuses } from '../domain/offer-status'
import { VIEWING_LABEL, contactFor } from '../domain/threads'
import { IllegalTransition } from '../domain/offer-status'
import { parseMajorUnits } from '../domain/search'
import { formatMoneyShort } from '../domain/money'
import { localeFor, noStore, type Context } from './context'

const str = (body: Record<string, unknown>, key: string, max = 2000): string =>
  typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : ''

const num = (body: Record<string, unknown>, key: string): number | undefined => {
  const raw = str(body, key)
  if (!/^\d{1,6}$/.test(raw)) return undefined
  return Number(raw)
}

/** Minor units back to the figure a person types. Integer arithmetic only. */
const majorUnits = (value: bigint): string => {
  const whole = value / 100n
  const fraction = value % 100n
  return fraction === 0n ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`
}

const lines = (body: Record<string, unknown>, key: string): string[] =>
  str(body, key, 8000).split('\n').map((line) => line.trim()).filter(Boolean)

export function adminRoutes(ctx: Context): Router {
  const router = Router()
  const { database, enquiries, authoring, accounts } = ctx
  const repos = database.repositories

  const onlyStaff = (_req: Request, res: Response, next: NextFunction): void => {
    noStore(res)
    if (!res.locals.staff) {
      res.redirect(303, '/staff/signin')
      return
    }
    next()
  }

  const guarded = (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!ctx.tokenAccepted(req)) {
          res.redirect(303, req.get('referer')?.startsWith(ctx.config.publicUrl) ? req.get('referer')! : '/staff')
          return
        }
        await handler(req, res)
      } catch (error) {
        next(error)
      }
    }

  router.use('/staff', onlyStaff)

  // ---- dashboard ----

  router.get('/staff', async (_req, res, next) => {
    try {
      const [registrations, offerCounts, viewingCounts, threads, response, enquiryForms] = await Promise.all([
        repos.users.countByStatus(),
        repos.offers.countsByStatus(),
        repos.viewings.countByStatus(),
        repos.threads.all({ open: true, limit: 8 }),
        enquiries.responseTimes(),
        repos.enquiries.recent(8),
      ])

      res.render('staff/dashboard', {
        nav: 'dashboard',
        title: 'Back office',
        description: 'Everything awaiting a decision.',
        staff: res.locals.staff,
        registrations,
        offerCounts,
        viewingCounts,
        threads,
        response,
        enquiryForms,
        statusLabel: STATUS_LABEL,
      })
    } catch (error) {
      next(error)
    }
  })

  // ---- offers ----

  router.get('/staff/offers', async (req, res, next) => {
    try {
      const status = OFFER_STATUSES.find((candidate) => candidate === req.query.status)
      const all = await repos.offers.everything()
      const properties = await repos.properties.all()
      const byId = new Map(properties.map((property) => [property.id, property]))
      const locale = localeFor(req)

      res.render('staff/offers', {
        nav: 'offers',
        title: 'Offers',
        description: 'Every offer, whatever its status.',
        // Named rows, not offers: pug's each-of lexer misreads any collection
        // whose name starts with "of".
        rows: (status ? all.filter((offer) => offer.status === status) : all).map((offer) => ({
          ...offer,
          property: byId.get(offer.propertyId),
          headlineText: formatMoneyShort(offer.headline, locale),
          statusLabel: STATUS_LABEL[offer.status],
          moves: nextStatuses(offer.status, offer.type),
        })),
        counts: await repos.offers.countsByStatus(),
        activeStatus: status ?? null,
        statusLabel: STATUS_LABEL,
        statuses: OFFER_STATUSES,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/offers/new', async (_req, res, next) => {
    try {
      res.render('staff/offer-form', {
        nav: 'offers',
        title: 'New offer',
        description: 'Create an offer against a building.',
        offer: null,
        properties: await repos.properties.all(),
        errors: {},
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/offers/:id', async (req, res, next) => {
    try {
      const offer = await repos.offers.byId(String(req.params.id))
      if (!offer) return next()
      res.render('staff/offer-form', {
        nav: 'offers',
        title: offer.slug,
        description: `Edit ${offer.slug}.`,
        offer: { ...offer, headlineMajor: majorUnits(offer.headline.amount) },
        properties: await repos.properties.all(),
        trail: await repos.audit.forSubject(`offer:${offer.id}`, 40),
        moves: nextStatuses(offer.status, offer.type),
        statusLabel: STATUS_LABEL,
        errors: {},
      })
    } catch (error) {
      next(error)
    }
  })

  const offerFromForm = (body: Record<string, unknown>) => {
    const currency = str(body, 'currency', 3).toUpperCase()
    const amount = parseMajorUnits(str(body, 'headline', 20))
    return {
      slug: str(body, 'slug', 120).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      propertyId: str(body, 'propertyId', 80),
      type: str(body, 'type', 20) as 'sale' | 'long_lease' | 'corporate_let',
      currency,
      headlineAmount: amount,
      scope: str(body, 'scope', 10) as 'whole' | 'floor' | 'unit',
      scopeLabel: str(body, 'scopeLabel', 80),
      tenure: (str(body, 'tenure', 20) || undefined) as 'freehold' | 'leasehold' | 'commonhold' | undefined,
      furnished: (str(body, 'furnished', 20) || undefined) as 'furnished' | 'part furnished' | 'unfurnished' | undefined,
      minTermMonths: num(body, 'minTermMonths'),
      maxTermMonths: num(body, 'maxTermMonths'),
      availableFrom: str(body, 'availableFrom', 10) || undefined,
      chainStatus: str(body, 'chainStatus', 120) || undefined,
      servicedLevel: str(body, 'servicedLevel', 120) || undefined,
    }
  }

  router.post('/staff/offers', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const form = offerFromForm(body)

    if (!form.slug || !form.propertyId || !form.currency || form.headlineAmount === undefined) {
      res.status(422).render('staff/offer-form', {
        nav: 'offers', title: 'New offer', description: 'Create an offer against a building.',
        offer: null, properties: await repos.properties.all(),
        errors: { form: 'A slug, a building, a currency and a headline figure are all required.' },
        values: body,
      })
      return
    }

    const offer = await authoring.createOffer(
      { ...form, status: 'draft', headline: { amount: form.headlineAmount, currency: form.currency } } as never,
      res.locals.staff.id,
    )
    res.redirect(303, `/staff/offers/${offer.id}`)
  }))

  router.post('/staff/offers/:id', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    await authoring.updateOffer(String(req.params.id), offerFromForm(body) as never, res.locals.staff.id)
    res.redirect(303, `/staff/offers/${req.params.id}`)
  }))

  router.post('/staff/offers/:id/status', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const to = OFFER_STATUSES.find((candidate) => candidate === str(body, 'status', 20))
    if (to) {
      try {
        await authoring.moveOffer(String(req.params.id), to, res.locals.staff.id, str(body, 'reason', 300) || undefined)
      } catch (error) {
        if (!(error instanceof IllegalTransition)) throw error
      }
    }
    res.redirect(303, `/staff/offers/${req.params.id}`)
  }))

  // ---- properties ----

  router.get('/staff/properties', async (_req, res, next) => {
    try {
      const properties = await repos.properties.all()
      const all = await repos.offers.everything()
      res.render('staff/properties', {
        nav: 'properties',
        title: 'Buildings',
        description: 'Every building Marchmont holds.',
        properties: properties.map((property) => ({
          ...property,
          offerCount: all.filter((offer) => offer.propertyId === property.id).length,
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/properties/new', (_req, res) => {
    res.render('staff/property-form', {
      nav: 'properties', title: 'New building', description: 'Add a building.',
      property: null, errors: {},
    })
  })

  router.get('/staff/properties/:id', async (req, res, next) => {
    try {
      const property = await repos.properties.byId(String(req.params.id))
      if (!property) return next()
      res.render('staff/property-form', {
        nav: 'properties',
        title: property.name,
        description: `Edit ${property.name}.`,
        property: {
          ...property,
          areaM2: String(property.area.hundredthsM2 / 100n),
          imageLines: property.images.map((image) => `${image.id}|${image.alt}`).join('\n'),
        },
        trail: await repos.audit.forSubject(`property:${property.id}`, 40),
        blocked: typeof req.query.blocked === 'string' ? req.query.blocked : null,
        errors: {},
      })
    } catch (error) {
      next(error)
    }
  })

  const propertyFromForm = (body: Record<string, unknown>) => ({
    slug: str(body, 'slug', 120).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name: str(body, 'name', 160),
    buildingType: str(body, 'buildingType', 10) as 'house' | 'office' | 'mixed',
    address: {
      formatted: str(body, 'formatted', 240),
      countryCode: str(body, 'countryCode', 2).toUpperCase(),
      locality: str(body, 'locality', 120),
      ...(str(body, 'region', 120) ? { region: str(body, 'region', 120) } : {}),
    },
    coordinates: [Number(str(body, 'longitude', 20)), Number(str(body, 'latitude', 20))] as [number, number],
    timeZone: str(body, 'timeZone', 60),
    area: { hundredthsM2: BigInt(num(body, 'areaM2') ?? 0) * 100n },
    floors: num(body, 'floors') ?? 1,
    yearBuilt: num(body, 'yearBuilt') ?? 1900,
    summary: str(body, 'summary', 400),
    description: lines(body, 'description'),
    features: lines(body, 'features'),
    bedrooms: num(body, 'bedrooms'),
    bathrooms: num(body, 'bathrooms'),
    energyRating: str(body, 'energyRating', 4) || undefined,
    images: lines(body, 'images').map((line) => {
      const [id, ...alt] = line.split('|')
      return { id: (id ?? '').trim(), alt: alt.join('|').trim() || 'Photograph of the building' }
    }).filter((image) => image.id),
  })

  router.post('/staff/properties', guarded(async (req, res) => {
    const form = propertyFromForm((req.body ?? {}) as Record<string, unknown>)
    if (!form.slug || !form.name || !form.address.locality) {
      res.status(422).render('staff/property-form', {
        nav: 'properties', title: 'New building', description: 'Add a building.',
        property: null, errors: { form: 'A slug, a name and a city are required.' },
      })
      return
    }
    const property = await authoring.createProperty(form as never, res.locals.staff.id)
    res.redirect(303, `/staff/properties/${property.id}`)
  }))

  router.post('/staff/properties/:id', guarded(async (req, res) => {
    await authoring.updateProperty(
      String(req.params.id),
      propertyFromForm((req.body ?? {}) as Record<string, unknown>) as never,
      res.locals.staff.id,
    )
    res.redirect(303, `/staff/properties/${req.params.id}`)
  }))

  router.post('/staff/properties/:id/delete', guarded(async (req, res) => {
    const outcome = await authoring.deleteProperty(String(req.params.id), res.locals.staff.id)
    res.redirect(303, outcome.deleted ? '/staff/properties' : `/staff/properties/${req.params.id}?blocked=${outcome.blockedBy}`)
  }))

  // ---- people ----

  router.get('/staff/people', async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'declined'].find((candidate) => candidate === req.query.status)
      const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
      res.render('staff/people', {
        nav: 'people',
        title: 'People',
        description: 'Everyone registered with Marchmont.',
        people: await repos.users.all({
          ...(status ? { status: status as 'pending' } : {}),
          ...(search ? { search } : {}),
        }),
        counts: await repos.users.countByStatus(),
        activeStatus: status ?? null,
        search,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/people/:id', async (req, res, next) => {
    try {
      const person = await repos.users.byId(String(req.params.id))
      if (!person) return next()
      const [threads, viewings, sessions, trail] = await Promise.all([
        repos.threads.forRegistrant(person.id),
        repos.viewings.forRegistrant(person.id),
        repos.sessions.listFor('registrant', person.id),
        repos.audit.forSubject(`user:${person.id}`, 60),
      ])
      res.render('staff/person', {
        nav: 'people',
        title: person.name,
        description: `Account for ${person.email}.`,
        person, threads, viewings, sessions, trail,
        viewingLabel: VIEWING_LABEL,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/staff/people/:id/decide', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const decision = body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : null
    if (decision) {
      await accounts.decide({
        userId: String(req.params.id),
        status: decision,
        staffId: res.locals.staff.id,
        ...(decision === 'declined' && str(body, 'reason', 500) ? { reason: str(body, 'reason', 500) } : {}),
      })
    }
    res.redirect(303, `/staff/people/${req.params.id}`)
  }))

  router.post('/staff/people/:id/reopen', guarded(async (req, res) => {
    await repos.users.reopen(String(req.params.id))
    await repos.audit.append({
      actor: `staff:${res.locals.staff.id}`,
      action: 'registration.reopened',
      subject: `user:${req.params.id}`,
    })
    res.redirect(303, `/staff/people/${req.params.id}`)
  }))

  router.post('/staff/people/:id/sessions/revoke', guarded(async (req, res) => {
    const closed = await repos.sessions.closeAllFor('registrant', String(req.params.id))
    await repos.audit.append({
      actor: `staff:${res.locals.staff.id}`,
      action: 'sessions.revoked',
      subject: `user:${req.params.id}`,
      detail: { closed },
    })
    res.redirect(303, `/staff/people/${req.params.id}`)
  }))

  router.post('/staff/people/:id/two-factor/reset', guarded(async (req, res) => {
    const person = await repos.users.byId(String(req.params.id))
    if (person?.twoFactor) {
      await repos.users.disableTwoFactor(person.id)
      await repos.sessions.closeAllFor('registrant', person.id)
      await repos.audit.append({
        actor: `staff:${res.locals.staff.id}`,
        action: 'two_factor.reset_by_staff',
        subject: `user:${person.id}`,
      })
    }
    res.redirect(303, `/staff/people/${req.params.id}`)
  }))

  // ---- enquiries ----

  router.get('/staff/enquiries', async (req, res, next) => {
    try {
      const showClosed = req.query.closed === '1'
      const threads = await repos.threads.all({ open: !showClosed })
      const people = new Map((await repos.users.all({ limit: 500 })).map((person) => [person.id, person]))

      res.render('staff/enquiries', {
        nav: 'enquiries',
        title: 'Enquiries',
        description: 'Enquiry threads against an offer.',
        threads: threads.map((thread) => {
          const person = people.get(thread.registrantId)
          return {
            ...thread,
            person,
            contact: person
              ? contactFor(thread, { email: person.email, ...(person.phone ? { phone: person.phone } : {}) })
              : null,
          }
        }),
        showClosed,
        response: await enquiries.responseTimes(),
        formEnquiries: await repos.enquiries.recent(50),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/staff/enquiries/:id', async (req, res, next) => {
    try {
      const thread = await repos.threads.byId(String(req.params.id))
      if (!thread) return next()
      const person = await repos.users.byId(thread.registrantId)
      res.render('staff/thread', {
        nav: 'enquiries',
        title: thread.subject,
        description: `Enquiry about ${thread.offerName}.`,
        thread,
        person,
        contact: person
          ? contactFor(thread, { email: person.email, ...(person.phone ? { phone: person.phone } : {}) })
          : null,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/staff/enquiries/:id/reply', guarded(async (req, res) => {
    const message = str((req.body ?? {}) as Record<string, unknown>, 'message', 4000)
    if (message.length >= 2) {
      await enquiries.reply({
        threadId: String(req.params.id),
        from: 'staff',
        authorId: res.locals.staff.id,
        authorName: res.locals.staff.name,
        body: message,
      })
    }
    res.redirect(303, `/staff/enquiries/${req.params.id}`)
  }))

  router.post('/staff/enquiries/:id/close', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (body.action === 'reopen') await enquiries.reopenThread(String(req.params.id), res.locals.staff.id)
    else await enquiries.closeThread(String(req.params.id), res.locals.staff.id)
    res.redirect(303, `/staff/enquiries/${req.params.id}`)
  }))

  // ---- viewings ----

  router.get('/staff/viewings', async (_req, res, next) => {
    try {
      const all = await repos.viewings.all()
      const people = new Map((await repos.users.all({ limit: 500 })).map((person) => [person.id, person]))
      const properties = await repos.properties.all()
      const zoneFor = new Map(properties.map((property) => [property.slug, property.timeZone ?? 'UTC']))
      const offers = await repos.offers.everything()
      const slugToProperty = new Map(offers.map((offer) => [offer.slug, offer.propertyId]))
      const byId = new Map(properties.map((property) => [property.id, property]))

      res.render('staff/viewings', {
        nav: 'viewings',
        title: 'Viewings',
        description: 'Viewing requests and confirmations.',
        viewings: all.map((viewing) => {
          const property = byId.get(slugToProperty.get(viewing.offerSlug) ?? '')
          return {
            ...viewing,
            person: people.get(viewing.registrantId),
            timeZone: property?.timeZone ?? zoneFor.get(viewing.offerSlug) ?? 'UTC',
          }
        }),
        counts: await repos.viewings.countByStatus(),
        viewingLabel: VIEWING_LABEL,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/staff/viewings/:id/decide', guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const to = ['confirmed', 'proposed', 'declined'].find((candidate) => candidate === str(body, 'decision', 20))
    if (to) {
      const confirmed = str(body, 'confirmedTime', 40)
      const when = confirmed ? new Date(confirmed) : undefined
      await enquiries.decideViewing({
        viewingId: String(req.params.id),
        to: to as 'confirmed',
        staffId: res.locals.staff.id,
        ...(when && !Number.isNaN(when.getTime()) ? { confirmedTime: when } : {}),
        ...(str(body, 'staffNote', 500) ? { staffNote: str(body, 'staffNote', 500) } : {}),
      })
    }
    res.redirect(303, '/staff/viewings')
  }))

  // ---- audit ----

  router.get('/staff/audit', async (req, res, next) => {
    try {
      const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : ''
      res.render('staff/audit', {
        nav: 'audit',
        title: 'Audit trail',
        description: 'Every recorded act, newest first.',
        entries: subject ? await repos.audit.forSubject(subject, 300) : await repos.audit.recent(300),
        subject,
      })
    } catch (error) {
      next(error)
    }
  })

  // ---- staff accounts ----

  router.get('/staff/team', async (_req, res, next) => {
    try {
      res.render('staff/team', {
        nav: 'team',
        title: 'Staff',
        description: 'People with back office access.',
        team: await repos.staff.count(),
        me: res.locals.staff,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
