import express, { type NextFunction, type Request, type Response } from 'express'
import { createAssetHasher } from './asset-hash'
import type { Config } from './config'
import type { Database } from './db/client'
import { ANONYMOUS } from './domain/viewer'
import { createImageProvider, createSandboxImageProvider, renderSandboxImage } from './providers/images'
import { createMapProvider, createSandboxMapProvider, renderSandboxMap } from './providers/maps'
import { CSRF_COOKIE, CSRF_FIELD, issueToken, readCookie, tokenFor, verifyToken } from './security/csrf'
import { createRateLimiter } from './security/rate-limit'
import { SESSION_LIFETIME_MS } from './services/accounts'
import { createPortfolio } from './services/portfolio'
import { createAccounts } from './services/accounts'
import { createEnquiries } from './services/enquiries'
import { createAuthoring } from './services/authoring'
import { createLogMailProvider, createSandboxMailProvider, type MailProvider } from './providers/mail'
import { accountRoutes } from './routes/account'
import { authRoutes, SESSION_COOKIE } from './routes/auth'
import { staffRoutes } from './routes/staff'
import { adminRoutes } from './routes/admin'
import { enquiryRoutes } from './routes/enquiries'
import type { Context } from './routes/context'
import { crawlerRoutes } from './routes/crawlers'
import { formRoutes } from './routes/forms'
import { pageRoutes } from './routes/pages'
import { portfolioRoutes } from './routes/portfolio'

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

const BRAND_IMAGE = {
  id: 'photo-1710547284002-255fc868e88b',
  alt: 'Brick mill building with rows of tall factory windows',
}

export type AppDeps = {
  config: Config
  database: Database
  mail?: MailProvider
  /** Public form allowance. Injectable so a test can exercise the limit deliberately. */
  submissionLimit?: { limit: number; windowMs: number }
}

export function createApp(deps: AppDeps): express.Express {
  const { config, database } = deps
  // The photography provider is the only external origin the policy admits,
  // and only for images. See src/providers/images.ts.
  const images = config.providers.images === 'unsplash' ? createImageProvider() : createSandboxImageProvider()
  const maps = config.providers.maps === 'osm' ? createMapProvider() : createSandboxMapProvider()
  const imageHosts = [...new Set([images.host, maps.host])].filter((host) => host !== "'self'")
  const CSP = [...CSP_BASE, ['img-src', "'self'", 'data:', ...imageHosts].join(' ')].join('; ')
  const mail = deps.mail ?? (config.providers.mail === 'sandbox' ? createSandboxMailProvider() : createLogMailProvider())
  const assets = createAssetHasher(config)
  const portfolio = createPortfolio(database.repositories, images, maps)
  const accounts = createAccounts({ repositories: database.repositories, mail, publicUrl: config.publicUrl })
  const enquiries = createEnquiries({ repositories: database.repositories, mail, publicUrl: config.publicUrl })
  const authoring = createAuthoring({ repositories: database.repositories })
  const app = express()

  const secure = config.publicUrl.startsWith('https:')

  function absolute(source: string): string {
    return source.startsWith('http') ? source : new URL(source, config.publicUrl).toString()
  }

  /**
   * A token is minted per response, but the salt it is bound to is reused for
   * as long as the browser holds one. Minting a fresh cookie every time meant
   * the stylesheet request that follows a page load rotated the salt out from
   * under the token already rendered into that page, so every form submission
   * failed. The token still changes per response, which is what double submit
   * needs; the cookie only changes when there is not already a usable one.
   */
  function csrfToken(req: Request, res: Response): string {
    const held = readCookie(req.headers.cookie, CSRF_COOKIE)
    if (held && /^[0-9a-f]{32}$/.test(held)) return tokenFor(config.sessionSecret, held)

    const issued = issueToken(config.sessionSecret)
    res.cookie(CSRF_COOKIE, issued.cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    })
    return issued.token
  }

  const submissions = createRateLimiter(deps.submissionLimit ?? { limit: 20, windowMs: 10 * 60 * 1000 })

  const context: Context = {
    config,
    database,
    portfolio,
    images,
    maps,
    accounts,
    enquiries,
    authoring,
    absolute,
    sessionCookie(res, sessionId) {
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: SESSION_LIFETIME_MS,
      })
    },
    tokenAccepted(req) {
      return verifyToken(config.sessionSecret, readCookie(req.headers.cookie, CSRF_COOKIE), req.body?.[CSRF_FIELD])
    },
    withinRate(req, key) {
      return submissions.take(`${key ?? req.path}:${req.ip ?? 'unknown'}`)
    },
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
    res.locals.viewer = ANONYMOUS
    next()
  })

  // Resolves the session once per request. Everything downstream reads
  // res.locals rather than reaching for a cookie of its own.
  app.use(async (req, res, next) => {
    try {
      const id = readCookie(req.headers.cookie, SESSION_COOKIE)
      if (!id) return next()

      const session = await database.repositories.sessions.find(id)
      if (!session) {
        res.clearCookie(SESSION_COOKIE, { path: '/' })
        return next()
      }

      res.locals.session = session

      if (session.principal === 'staff') {
        const member = await database.repositories.staff.byId(session.subjectId)
        if (member) res.locals.staff = member
        return next()
      }

      const account = await database.repositories.users.byId(session.subjectId)
      if (!account) return next()
      res.locals.account = account

      // A session that has not cleared the code step is signed in for nothing
      // but the code step itself, so the viewer stays anonymous until it has.
      const cleared = !account.twoFactor || Boolean(session.twoFactorAt)
      if (cleared) {
        res.locals.viewer = { state: account.accountStatus === 'approved' ? 'approved' : 'pending' }
      } else {
        res.locals.account = undefined
        res.locals.pendingTwoFactor = account
      }

      next()
    } catch (error) {
      next(error)
    }
  })

  app.use(
    express.static(new URL('../public', import.meta.url).pathname, {
      maxAge: config.nodeEnv === 'production' ? '365d' : 0,
      index: false,
    }),
  )

  // Only mounted for the sandbox providers. Under the external ones the policy
  // does not name 'self' for these and nothing requests the paths.
  const drawn = (render: (file: string) => { body: string } | null) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const file = req.params.file
      const image = typeof file === 'string' ? render(file) : null
      if (!image) return next()
      res.type('image/svg+xml')
      res.setHeader('Cache-Control', config.nodeEnv === 'production' ? 'public, max-age=31536000, immutable' : 'no-store')
      res.send(image.body)
    }

  if (config.providers.images === 'sandbox') app.get('/images/:file', drawn(renderSandboxImage))
  if (config.providers.maps === 'sandbox') app.get('/maps/:file', drawn(renderSandboxMap))

  app.use(authRoutes(context))
  app.use(accountRoutes(context))
  app.use(staffRoutes(context))
  app.use(adminRoutes(context))
  app.use(enquiryRoutes(context))
  app.use(pageRoutes(context))
  app.use(portfolioRoutes(context))
  app.use(formRoutes(context))
  app.use(crawlerRoutes(context))

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
