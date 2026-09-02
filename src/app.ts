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

const ROUTE_SIZES = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px'

const OFFER_TYPES: readonly OfferType[] = ['sale', 'long_lease', 'corporate_let']

const HEADING: Record<string, { heading: string; blurb: string }> = {
  all: {
    heading: 'Everything we are offering',
    blurb: 'Every building here belongs to us. No chain, no agent between you and the answer, and every figure on the page rather than quoted on request.',
  },
  sale: {
    heading: 'For sale',
    blurb: 'Whole buildings and single lofts, freehold and leasehold. Guide price, tenure and chain position are published on every one.',
  },
  long_lease: {
    heading: 'To let',
    blurb: 'Twelve months and up, by the floor or the whole building. Rent, deposit, service charge and the available from date are on the page.',
  },
  corporate_let: {
    heading: 'Corporate lets',
    blurb: 'One to six months, furnished and serviced, for companies moving people between cities. Housekeeping and bills are itemised in the terms.',
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
          title: 'Buy a building',
          href: '/portfolio?type=sale',
          count: counts.sale,
          blurb: 'Whole buildings and single lofts, freehold and leasehold. Guide price, tenure and chain position are on the page before you ask for them.',
          image: images.render(
            { id: 'photo-1774957108662-80d697d70844', alt: 'Tall brick warehouse facade with many windows against the sky' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Take a long lease',
          href: '/portfolio?type=long_lease',
          count: counts.long_lease,
          blurb: 'Twelve months and up, by the floor or the whole building. Rent, deposit, service charge and the available from date are published, not quoted on request.',
          image: images.render(
            { id: 'photo-1785381523158-86cbb796ef2b', alt: 'Empty office floor with exposed structure, ready for fit out' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Stay for a season',
          href: '/portfolio?type=corporate_let',
          count: counts.corporate_let,
          blurb: 'One to six months, furnished and serviced, for companies moving people between cities. Housekeeping and bills are itemised in the terms.',
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
          'Converted mills, warehouses and foundries in prime districts across nine cities. Held on our own account and offered for sale, on long lease, or by the season.',
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
      const raw = typeof req.query.type === 'string' ? req.query.type : ''
      const type = OFFER_TYPES.find((candidate) => candidate === raw)
      const city = typeof req.query.city === 'string' ? req.query.city : ''
      const [matching, everything] = await Promise.all([
        portfolio.list(type ? { type } : {}, locale),
        portfolio.list({}, locale),
      ])

      const cityName = city
        ? everything.find((listing) => listing.countryCode === city)?.locality
        : undefined
      const listings = city ? matching.filter((listing) => listing.countryCode === city) : matching

      const key = type ?? 'all'
      const heading = cityName ? `${HEADING[key]!.heading} in ${cityName}` : HEADING[key]!.heading

      res.render('portfolio', {
        nav: 'portfolio',
        title: heading,
        description: HEADING[key]!.blurb,
        heading,
        blurb: HEADING[key]!.blurb,
        activeType: key,
        activeCity: cityName ?? null,
        cityQuery: city ? `&city=${encodeURIComponent(city)}` : '',
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
      description: 'We buy mills, warehouses and foundries in prime districts, restore what matters, and hold them on our own account.',
      hero: images.render(
        { id: 'photo-1710547284002-255fc868e88b', alt: 'Large brick mill building with rows of tall factory windows' },
        'hero',
        '100vw',
      ),
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
        hero: images.render(
          { id: 'photo-1692696746783-14e5e56a6387', alt: 'Empty mill interior with exposed brick and a timber ceiling structure' },
          'hero',
          '100vw',
        ),
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
      description: 'Ask us about a building. We hold the survey, the title and the service charge history for everything on this site.',
      hero: images.render(
        { id: 'photo-1727639707159-eb0c8c779996', alt: 'Warm brick stairwell lit by a tall window' },
        'hero',
        '100vw',
      ),
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
