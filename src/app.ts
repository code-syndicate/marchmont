import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'
import type { OfferType } from './db/repositories/offers'
import { createImageProvider } from './providers/images'
import { createPortfolio } from './services/portfolio'

const images = createImageProvider()

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // The photography provider is the only external origin the policy admits,
  // and only for images. See src/providers/images.ts.
  `img-src 'self' data: ${images.host}`,
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

const OFFER_TYPES: readonly OfferType[] = ['sale', 'long_lease', 'corporate_let']

const HEADING: Record<string, { heading: string; blurb: string }> = {
  all: {
    heading: 'Everything currently offered',
    blurb: 'The whole portfolio, for sale and to let, in the currency of the market each building sits in.',
  },
  sale: {
    heading: 'For sale',
    blurb: 'Houses and whole buildings held freehold or leasehold. Guide price, tenure and chain position are stated on every one.',
  },
  long_lease: {
    heading: 'To let',
    blurb: 'Twelve months and up. Rent, deposit, service charge and the available from date are published rather than quoted on request.',
  },
  corporate_let: {
    heading: 'Corporate lets',
    blurb: 'One to six months, furnished, for companies moving people between cities. Housekeeping and bills are itemised in the terms.',
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

export function createApp(deps: { config: Config; database: Database }): express.Express {
  const { config, database } = deps
  const assets = createAssetHasher(config)
  const portfolio = createPortfolio(database.repositories, images)
  const app = express()

  app.disable('x-powered-by')
  app.set('view engine', 'pug')
  app.set('views', new URL('views', import.meta.url).pathname)
  app.use(express.urlencoded({ extended: false }))

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.locals.cssHref = assets.cssHref()
    res.locals.year = new Date().getFullYear()
    res.locals.nav = ''
    next()
  })

  app.use(
    express.static(new URL('../public', import.meta.url).pathname, {
      maxAge: config.nodeEnv === 'production' ? '365d' : 0,
      index: false,
    }),
  )

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
        portfolio.featured(locale, 5),
        portfolio.counts(),
        portfolio.list({}, locale),
      ])
      res.render('home', {
        nav: 'home',
        hero: images.render(
          {
            id: 'photo-1773069459477-e9fe9d6eeb60',
            alt: 'Interior of a converted mill with exposed brick columns and tall factory windows',
          },
          'hero',
          '100vw',
        ),
        title: null,
        description:
          'Houses and offices held on our own account, offered for sale, on long lease, or on a corporate let. Shown by appointment.',
        featured,
        counts,
        totalCount: everything.length,
        countryCount: new Set(everything.map((listing) => listing.countryCode)).size,
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
      const raw = typeof req.query.type === 'string' ? req.query.type : ''
      const type = OFFER_TYPES.find((candidate) => candidate === raw)
      const [listings, everything] = await Promise.all([
        portfolio.list(type ? { type } : {}, locale),
        portfolio.list({}, locale),
      ])
      const key = type ?? 'all'
      res.render('portfolio', {
        nav: 'portfolio',
        title: HEADING[key]!.heading,
        description: HEADING[key]!.blurb,
        heading: HEADING[key]!.heading,
        blurb: HEADING[key]!.blurb,
        activeType: key,
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

  app.get('/about', (_req, res) => {
    res.render('about', {
      nav: 'about',
      title: 'The house',
      description: 'Marchmont owns what it offers. How we work, and why we review a registration before releasing an address.',
    })
  })

  app.get('/register', async (req, res, next) => {
    try {
      const locale = localeFor(req)
      const listings = await portfolio.list({}, locale)
      const countries = [...new Map(listings.map((l) => [l.countryCode, l.country])).entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name, locale))
      res.render('register', {
        nav: 'register',
        title: 'Register an interest',
        description: 'Tell us what you are looking for. Registrations are reviewed within two working days.',
        offer: typeof req.query.offer === 'string' ? req.query.offer : null,
        countries,
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/contact', (_req, res) => {
    res.render('contact', {
      nav: 'contact',
      title: 'Contact',
      description: 'Speak to someone at the house. Enquiries about a specific building are answered fastest if you name it.',
    })
  })

  app.use((_req, res) => {
    res.status(404).render('404', {
      title: 'Page not found',
      code: 'Error 404',
      heading: 'That page does not exist.',
      message: 'The link may be old, or the offer may have been withdrawn. The portfolio turns over slowly, so it is worth a look.',
    })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).render('404', {
      title: 'Something went wrong',
      code: 'Error 500',
      heading: 'Something went wrong at our end.',
      message: 'The fault is ours and it has been logged. Try again in a moment, or write to us and we will look into it.',
    })
  })

  return app
}
