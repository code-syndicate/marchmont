import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'
import type { OfferType } from './db/repositories/offers'
import { createImageProvider, createSandboxImageProvider } from './providers/images'
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

export function createApp(deps: { config: Config; database: Database }): express.Express {
  const { config, database } = deps
  // The photography provider is the only external origin the policy admits,
  // and only for images. See src/providers/images.ts.
  const images = config.providers.images === 'unsplash' ? createImageProvider() : createSandboxImageProvider()
  const CSP = [...CSP_BASE, `img-src 'self' data: ${images.host}`].join('; ')
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
        description: 'Register your requirement with Marchmont. Approval opens exact addresses, full terms, floor plans and supporting documentation.',
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
      description: 'Contact Marchmont about a specific building or a general requirement. Registrations are reviewed within two working days.',
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
