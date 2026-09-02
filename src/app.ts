import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

export function createApp(deps: { config: Config; database: Database }): express.Express {
  const { config, database } = deps
  const assets = createAssetHasher(config)
  const app = express()

  app.disable('x-powered-by')
  app.set('view engine', 'pug')
  app.set('views', new URL('views', import.meta.url).pathname)

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.locals.cssHref = assets.cssHref()
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

  app.use((_req, res) => {
    res.status(404).render('404', { title: 'Page not found' })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).render('404', { title: 'Something went wrong' })
  })

  return app
}
