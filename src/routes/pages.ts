import { Router } from 'express'
import { localeFor, type Context } from './context'

const ROUTE_SIZES = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px'

export function pageRoutes(ctx: Context): Router {
  const router = Router()
  const { database, portfolio, images } = ctx

  /**
   * Liveness. Answers 200 whenever the process is up, and reports the database
   * alongside rather than failing on it.
   *
   * This is what the platform restarts on, so it must not depend on anything
   * else being reachable. It used to answer 503 when Mongo did not respond,
   * which handed a shared database tier the power to kill the instance: one
   * slow ping and the host replaced a process that was serving pages perfectly
   * well, and a database having a bad minute became an outage.
   */
  router.get('/health', async (_req, res) => {
    let database_ = 'unreachable'
    try {
      await database.db.command({ ping: 1 })
      database_ = 'ready'
    } catch {
      // Reported, never fatal.
    }
    res.status(200).json({ status: 'alive', database: database_ })
  })

  /** Readiness. Fails when the site cannot actually serve, for monitoring. */
  router.get('/health/ready', async (_req, res) => {
    try {
      await database.db.command({ ping: 1 })
      res.status(200).json({ status: 'ready' })
    } catch {
      res.status(503).json({ status: 'unavailable' })
    }
  })

  router.get('/', async (req, res, next) => {
    try {
      const locale = localeFor(req)
      const [featured, counts, everything] = await Promise.all([
        portfolio.featured(locale, 6, res.locals.viewer),
        portfolio.counts(),
        portfolio.list({}, locale, res.locals.viewer),
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
          blurb: 'Houses offered freehold and leasehold. Guide price, tenure and chain position are published on every listing.',
          image: images.render(
            { id: 'villa-side-elevation', alt: 'Travertine and glass elevation with a first floor terrace' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Long lease',
          href: '/portfolio?type=long_lease',
          count: counts.long_lease,
          blurb: 'Houses let furnished or unfurnished on terms from twelve months. Rent, deposit and availability date are published on every listing.',
          image: images.render(
            { id: 'villa-kitchen', alt: 'Kitchen with a long timber island, open to the dining and living areas' },
            'card',
            ROUTE_SIZES,
          ),
        },
        {
          title: 'Corporate let',
          href: '/portfolio?type=corporate_let',
          count: counts.corporate_let,
          blurb: 'Furnished and serviced houses from one to six months, for organisations relocating staff. Housekeeping and included utilities are itemised in the terms.',
          image: images.render(
            { id: 'villa-library-room', alt: 'Furnished living room with a walnut shelving wall and floor to ceiling glass' },
            'card',
            ROUTE_SIZES,
          ),
        },
      ]

      res.render('home', {
        nav: 'home',
        title: null,
        description:
          'Houses in established residential districts, owned by Nash Luxury Realty and offered directly for sale, on long lease, or on a corporate let.',
        hero: images.render(
          {
            id: 'villa-pool-terrace',
            alt: 'Covered terrace with an outdoor kitchen beside a long pool, the house beyond',
          },
          'hero',
          '100vw',
        ),
        closer: images.render(
          {
            id: 'villa-upper-terrace',
            alt: 'Covered upper terrace with outdoor seating and a glass balustrade',
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
        newestYear: Math.max(...everything.map((listing) => listing.yearBuilt)),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/gallery', async (req, res, next) => {
    try {
      const buildings = await portfolio.buildings(localeFor(req), res.locals.viewer)
      res.render('gallery', {
        nav: 'gallery',
        title: 'Gallery',
        description:
          'Every house in the collection, photographed inside and out, with what is currently available in each.',
        buildings,
        hero: images.render(
          { id: 'villa-front-gate', alt: 'The house from the street, with the entrance gate set in a stone pillar' },
          'hero',
          '100vw',
        ),
        closer: images.render(
          { id: 'villa-family-room', alt: 'Family room with walnut panelled walls and low sofas' },
          'hero',
          '100vw',
        ),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/about', (_req, res) => {
    res.render('about', {
      nav: 'about',
      title: 'The house',
      description: 'Nash Luxury Realty buys and holds houses in established residential districts and offers them directly to buyers and tenants.',
      hero: images.render(
        { id: 'villa-aerial-grove', alt: 'Aerial view of a residential neighbourhood running down to the water' },
        'hero',
        '100vw',
      ),
    })
  })

  return router
}
