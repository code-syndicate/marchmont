import { Router } from 'express'
import { ANONYMOUS } from '../domain/viewer'
import { isNarrowed, parseSearch, toFormValues, toQueryString, type Search } from '../domain/search'
import { localeFor, type Context } from './context'

const HEADING: Record<string, { heading: string; blurb: string }> = {
  all: {
    heading: 'Available properties',
    blurb: 'Every property listed is owned by Nash Luxury Realty and offered directly. Pricing, tenure, service charge and availability are published on each listing.',
  },
  sale: {
    heading: 'For sale',
    blurb: 'Whole buildings and individual loft residences, offered freehold and leasehold. Guide price, tenure, service charge and chain position are published on each listing.',
  },
  long_lease: {
    heading: 'To let',
    blurb: 'Terms from twelve months, taken by the floor or as a whole building. Rent, deposit, service charge and availability date are published on each listing.',
  },
  corporate_let: {
    heading: 'Corporate lets',
    blurb: 'Furnished and serviced residences from one to six months, for organisations relocating senior staff. Housekeeping and included utilities are itemised in the terms.',
  },
}


/**
 * parseSearch drops anything it does not recognise so a stray parameter cannot
 * break a page. The route still wants to know it happened, so a bad value can
 * be a 404 rather than a quietly different listing.
 */
function suppliedValueSurvived(key: string, raw: string, search: Search): boolean {
  switch (key) {
    case 'type': return search.type === raw
    case 'city': return search.city?.toLowerCase() === raw.toLowerCase()
    case 'currency': return search.currency === raw.toUpperCase()
    case 'buildingType': return search.buildingType === raw
    case 'scope': return search.scope === raw
    case 'tenure': return search.tenure === raw
    case 'furnished': return search.furnished === raw
    // A price sort with no currency deliberately falls back, and that is a
    // usable page rather than a wrong address.
    case 'sort': return search.sort === raw || raw.startsWith('price_')
    default: return true
  }
}


export function portfolioRoutes(ctx: Context): Router {
  const router = Router()
  const { portfolio } = ctx

  router.get('/portfolio', async (req, res, next) => {
    try {
      const locale = localeFor(req)
      const facets = await portfolio.facets()
      const params = req.query as Record<string, unknown>

      // A value the portfolio does not hold is a wrong address rather than a
      // silent reset to everything, which was getting mistyped links indexed as
      // duplicates of the plain listing.
      const asked = ['type', 'city', 'currency', 'buildingType', 'scope', 'tenure', 'furnished', 'sort']
      const search = parseSearch(params, facets)
      for (const key of asked) {
        const raw = typeof params[key] === 'string' ? (params[key] as string).trim() : ''
        if (raw && !suppliedValueSurvived(key, raw, search)) return next()
      }

      const [listings, everything] = await Promise.all([
        portfolio.search(search, locale, res.locals.viewer),
        portfolio.list({}, locale, res.locals.viewer),
      ])

      const key = search.type ?? 'all'
      const heading = search.city ? `${HEADING[key]!.heading} in ${search.city}` : HEADING[key]!.heading

      res.render('portfolio', {
        nav: 'portfolio',
        title: heading,
        description: HEADING[key]!.blurb,
        heading,
        blurb: HEADING[key]!.blurb,
        search,
        values: toFormValues(search),
        facets,
        narrowed: isNarrowed(search),
        link: (changes: Record<string, string | undefined>) => `/portfolio${toQueryString(search, changes)}`,
        activeType: key,
        listings,
        totalCount: everything.length,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/portfolio/:slug', async (req, res, next) => {
    try {
      const listing = await portfolio.detail(req.params.slug, localeFor(req), res.locals.viewer ?? ANONYMOUS)
      if (!listing) return next()
      // A building shares as itself; everything else shares as the house.
      if (listing.cover) res.locals.ogImage = ctx.absolute(listing.cover.src)
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

  return router
}
