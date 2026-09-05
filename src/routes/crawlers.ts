import { Router } from 'express'
import type { Context } from './context'

const SITEMAP_PAGES = ['/', '/portfolio', '/gallery', '/about', '/register', '/contact']

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}


export function crawlerRoutes(ctx: Context): Router {
  const router = Router()
  const { config, portfolio } = ctx

  router.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', config.publicUrl).toString()}\n`)
  })

  router.get('/sitemap.xml', async (_req, res, next) => {
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

  return router
}
