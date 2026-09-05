import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'
import type { OfferType } from './db/repositories/offers'
import { createImageProvider, createSandboxImageProvider, renderSandboxImage } from './providers/images'
import { CSRF_COOKIE, CSRF_FIELD, issueToken, readCookie, verifyToken } from './security/csrf'
import { validateEnquiry, validateRegistration } from './domain/submissions'
import { createRateLimiter } from './security/rate-limit'
import { createPortfolio } from './services/portfolio'

const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
]

const ROUTE_SIZES = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px'

const OFFER_TYPES: readonly OfferType[] = ['sale', 'long_lease', 'corporate_let']

const HEADING: Record<string, { heading: string; blurb: string }> = {
  all: {
    heading: 'Available properties',
    blurb: 'Every property listed is owned by Marchmont and offered directly. Pricing, tenure, service charge and availability are published on each listing.',
  },
  sale: {
    heading: 'For sale',
    blurb: 'Whole buildings and individual lofts, offered freehold and leasehold. Guide price, tenure, service charge and chain position are published on each listing.',
  },
  long_lease: {
    heading: 'To let',
    blurb: 'Terms from twelve months, taken by the floor or as a whole building. Rent, deposit, service charge and availability date are published on each listing.',
  },
  corporate_let: {
    heading: 'Corporate lets',
    blurb: 'Furnished and serviced accommodation from one to six months, for organisations relocating staff. Housekeeping and included utilities are itemised in the terms.',
  },
}

function localeFor(req: Request): string {
  const header = req.headers['accept-language']
  if (!header) return 'en-GB'
  const first = header.split(',')[0]?.trim()
  if (!first) return 'en-GB'
  try {
    return new Intl.Locale(first).toString()
  } catch {
    return 'en-GB'
  }
}

const BRAND_IMAGE = {
  id: 'photo-1710547284002-255fc868e88b',
  alt: 'Brick mill building with rows of tall factory windows',
}

const SITEMAP_PAGES = ['/', '/portfolio', '/gallery', '/about', '/register', '/contact']

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function createApp(deps: { config: Config; database: Database }): express.Express {
  const { config, database } = deps
  // The photography provider is the only external origin the policy admits,
  // and only for images. See src/providers/images.ts.
  const images = config.providers.images === 'unsplash' ? createImageProvider() : createSandboxImageProvider()
  const CSP = [...CSP_BASE, `img-src 'self' data: ${images.host}`].join('; ')
  const assets = createAssetHasher(config)
  const portfolio = createPortfolio(database.repositories, images)
  const app = express()

  function absolute(source: string): string {
    return source.startsWith('http') ? source : new URL(source, config.publicUrl).toString()
  }

  // One token per response, so a page rendered from cache never carries a
  // token whose cookie the browser no longer holds.
  function csrfToken(req: Request, res: Response): string {
    const issued = issueToken(config.sessionSecret)
    res.cookie(CSRF_COOKIE, issued.cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.publicUrl.startsWith('https:'),
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    })
    return issued.token
  }

  const submissions = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 })

  function withinRate(req: Request): boolean {
    return submissions.take(`${req.path}:${req.ip ?? 'unknown'}`)
  }

  function tokenAccepted(req: Request): boolean {
    return verifyToken(config.sessionSecret, readCookie(req.headers.cookie, CSRF_COOKIE), req.body?.[CSRF_FIELD])
  }

  app.disable('x-powered-by')
  app.set('view engine', 'pug')
  app.set('views', new URL('views', import.meta.url).pathname)
  // A form on this site is a few hundred bytes. The default is 100kb, and
  // there is no reason to read more than this from an unauthenticated caller.
  app.use(express.urlencoded({ extended: false, limit: '32kb' }))

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.locals.cssHref = assets.cssHref()
    res.locals.year = new Date().getFullYear()
    res.locals.nav = ''
    res.locals.canonical = new URL(req.path, config.publicUrl).toString()
    res.locals.ogImage = absolute(images.render(BRAND_IMAGE, 'card', '800px').src)
    res.locals.csrfToken = csrfToken(req, res)
    next()
  })

  app.use(
    express.static(new URL('../public', import.meta.url).pathname, {
      maxAge: config.nodeEnv === 'production' ? '365d' : 0,
      index: false,
    }),
  )

  // Only mounted for the sandbox provider. Under unsplash the policy does not
  // name 'self' for images and nothing requests this path.
  if (config.providers.images === 'sandbox') {
    app.get('/images/:file', (req, res, next) => {
      const drawn = renderSandboxImage(req.params.file)
      if (!drawn) return next()
      res.type('image/svg+xml')
      res.setHeader('Cache-Control', config.nodeEnv === 'production' ? 'public, max-age=31536000, immutable' : 'no-store')
      res.send(drawn.body)
    })
  }

  app.get('/health', async (_req, res) => {
    try {
      await database.db.command({ ping: 1 })
      res.status(200).json({ status: 'ready' })
    } catch {
      res.status(503).json({ status: 'unavailable' })
    }
  })

  app.get('/', async (req, res, next) => {
    try {
      const locale = localeFor(req)
      const [featured, counts, everything] = await Promise.all([
        portfolio.featured(locale, 6),
        portfolio.counts(),
        portfolio.list({}, locale),
      ])

      const cityCounts = new Map<string, { name: string; code: string; count: number }>()
      for (const listing of everything) {
        const existing = cityCounts.get(listing.locality)
        if (existing) existing.count += 1
        else cityCounts.set(listing.locality, { name: listing.locality, code: listing.countryCode, count: 1 })
      }

      const routes = [
        {
          title: 'Purchase',
          href: '/portfolio?type=sale',
          count: counts.sale,
          blurb: 'Whole buildings and individual lofts, freehold and leasehold. Guide price, tenure, service charge and chain position are published on every listing.',
          image: images.render(
            { id: 'photo-1774957108662-80d697d70844', alt: 'Tall brick warehouse facade with many windows against the sky' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Long lease',
          href: '/portfolio?type=long_lease',
          count: counts.long_lease,
          blurb: 'Terms from twelve months, taken by the floor or as a whole building. Rent, deposit, service charge and availability date are published on every listing.',
          image: images.render(
            { id: 'photo-1785381523158-86cbb796ef2b', alt: 'Empty office floor with exposed structure, ready for fit out' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Corporate let',
          href: '/portfolio?type=corporate_let',
          count: counts.corporate_let,
          blurb: 'Furnished and serviced accommodation from one to six months, for organisations relocating staff. Housekeeping and included utilities are itemised in the terms.',
          image: images.render(
            { id: 'photo-1505873242700-f289a29e1e0f', alt: 'Loft interior with exposed brick, timber posts and an open living area' },
            'card',
            ROUTE_SIZES,
          ),
        },
      ]

      res.render('home', {
        nav: 'home',
        title: null,
        description:
          'Loft residences and creative office space in restored mills, warehouses and foundries across nine cities. Offered directly for sale, on long lease, or on a corporate let.',
        hero: images.render(
          {
            id: 'photo-1773069459477-e9fe9d6eeb60',
            alt: 'Interior of a converted mill with exposed brick columns and tall factory windows',
          },
          'hero',
          '100vw',
        ),
        closer: images.render(
          {
            id: 'photo-1764726331208-71cb385ab08c',
            alt: 'Late afternoon light falling across an empty loft floor',
          },
          'hero',
          '100vw',
        ),
        featured,
        counts,
        routes,
        cities: [...cityCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, locale)),
        totalCount: everything.length,
        cityCount: cityCounts.size,
        currencyCount: new Set(everything.map((listing) => listing.headline.replace(/[\d\s.,]/g, ''))).size,
        oldestYear: Math.min(...everything.map((listing) => listing.yearBuilt)),
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/portfolio', async (req, res, next) => {
    try {
      const locale = localeFor(req)
      const rawType = typeof req.query.type === 'string' ? req.query.type : ''
      const type = OFFER_TYPES.find((candidate) => candidate === rawType)
      // A tenure that does not exist is a wrong address, not a silent reset to
      // everything. Returning 200 with the full list lets a mistyped link get
      // indexed as a duplicate of /portfolio.
      if (rawType && !type) return next()

      const city = typeof req.query.city === 'string' ? req.query.city.trim() : ''

      const [matching, everything] = await Promise.all([
        portfolio.list(type ? { type } : {}, locale),
        portfolio.list({}, locale),
      ])

      // Locality, not country. A country holds many cities, and matching on the
      // country code labelled the page with whichever city happened to be first.
      const cities = [...new Set(everything.map((listing) => listing.locality))]
        .sort((a, b) => a.localeCompare(b, locale))
      const activeCity = cities.find((name) => name.toLowerCase() === city.toLowerCase())
      if (city && !activeCity) return next()

      const listings = activeCity ? matching.filter((listing) => listing.locality === activeCity) : matching

      const key = type ?? 'all'
      const heading = activeCity ? `${HEADING[key]!.heading} in ${activeCity}` : HEADING[key]!.heading

      res.render('portfolio', {
        nav: 'portfolio',
        title: heading,
        description: HEADING[key]!.blurb,
        heading,
        blurb: HEADING[key]!.blurb,
        activeType: key,
        activeCity: activeCity ?? null,
        cities,
        cityQuery: activeCity ? `&city=${encodeURIComponent(activeCity)}` : '',
        listings,
        totalCount: everything.length,
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/portfolio/:slug', async (req, res, next) => {
    try {
      const listing = await portfolio.detail(req.params.slug, localeFor(req))
      if (!listing) return next()
      res.render('offer', {
        nav: 'portfolio',
        title: `${listing.name}, ${listing.locality}`,
        description: listing.summary,
        listing,
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/gallery', async (req, res, next) => {
    try {
      const buildings = await portfolio.buildings(localeFor(req))
      res.render('gallery', {
        nav: 'gallery',
        title: 'Gallery',
        description:
          'Nine restored industrial buildings across nine cities, photographed inside and out, with what is currently available in each.',
        buildings,
        hero: images.render(
          { id: 'photo-1690368358248-6ab7d1921e27', alt: 'Large mill interior with rows of tall factory windows' },
          'hero',
          '100vw',
        ),
        closer: images.render(
          { id: 'photo-1706967413741-b8461ff8d370', alt: 'Living room with tall factory windows and exposed structure' },
          'hero',
          '100vw',
        ),
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/about', (_req, res) => {
    res.render('about', {
      nav: 'about',
      title: 'The house',
      description: 'Marchmont acquires, restores and holds industrial buildings, converting them into loft residences and creative office space in nine cities.',
      hero: images.render(
        { id: 'photo-1710547284002-255fc868e88b', alt: 'Large brick mill building with rows of tall factory windows' },
        'hero',
        '100vw',
      ),
    })
  })

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
        'Register your requirement with Marchmont. Approval opens exact addresses, full terms, floor plans and supporting documentation.',
      offer: typeof req.query.offer === 'string' ? req.query.offer : null,
      hero: images.render(
        { id: 'photo-1692696746783-14e5e56a6387', alt: 'Empty mill interior with exposed brick and a timber ceiling structure' },
        'hero',
        '100vw',
      ),
      countries,
      errors: {},
      values: {},
      ...extra,
    }
  }

  app.get('/register', async (req, res, next) => {
    try {
      res.render('register', await registerPage(req))
    } catch (error) {
      next(error)
    }
  })

  app.post('/register', async (req, res, next) => {
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

      const outcome = await database.repositories.users.register(result.value)
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

  app.get('/register/received', (_req, res) => {
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
      description: 'Contact Marchmont about a specific building or a general requirement. Registrations are reviewed within two working days.',
      hero: images.render(
        { id: 'photo-1727639707159-eb0c8c779996', alt: 'Warm brick stairwell lit by a tall window' },
        'hero',
        '100vw',
      ),
      errors: {},
      values: {},
      ...extra,
    }
  }

  app.get('/contact', (_req, res) => {
    res.render('contact', contactPage())
  })

  app.post('/contact', async (req, res, next) => {
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

  app.get('/contact/received', (_req, res) => {
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

  app.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', config.publicUrl).toString()}\n`)
  })

  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const listings = await portfolio.list({}, 'en-GB')
      const paths = [...SITEMAP_PAGES, ...listings.map((listing) => `/portfolio/${listing.slug}`)]
      const urls = paths
        .map((path) => `  <url><loc>${escapeXml(new URL(path, config.publicUrl).toString())}</loc></url>`)
        .join('\n')
      res
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
    } catch (error) {
      next(error)
    }
  })

  app.use((_req, res) => {
    res.status(404).render('404', {
      title: 'Page not found',
      code: 'Error 404',
      heading: 'Page not found',
      message: 'This page is unavailable. The link may be out of date, or the property may no longer be offered.',
    })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).render('404', {
      title: 'Something went wrong',
      code: 'Error 500',
      heading: 'Something went wrong',
      message: 'The page could not be loaded. The error has been recorded. Please try again, or contact us if the problem continues.',
    })
  })

  return app
}
