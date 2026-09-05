import { Router } from 'express'
import { localeFor, type Context } from './context'

const ROUTE_SIZES = '(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px'

export function pageRoutes(ctx: Context): Router {
  const router = Router()
  const { database, portfolio, images } = ctx

  router.get('/health', async (_req, res) => {
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

  router.get('/gallery', async (req, res, next) => {
    try {
      const buildings = await portfolio.buildings(localeFor(req), res.locals.viewer)
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

  router.get('/about', (_req, res) => {
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

  return router
}
