import type { Request, Response } from 'express'
import type { Config } from '../config'
import type { Database } from '../db/client'
import type { ImageProvider } from '../providers/images'
import type { MapProvider } from '../providers/maps'
import type { Portfolio } from '../services/portfolio'
import type { Accounts } from '../services/accounts'
import type { Enquiries } from '../services/enquiries'
import type { Authoring } from '../services/authoring'

/** Everything a route group needs, assembled once in createApp. */
export type Context = {
  readonly config: Config
  readonly database: Database
  readonly portfolio: Portfolio
  readonly images: ImageProvider
  readonly maps: MapProvider
  readonly accounts: Accounts
  readonly enquiries: Enquiries
  readonly authoring: Authoring
  /** True when the request carries a CSRF token matching its own cookie. */
  tokenAccepted(req: Request): boolean
  /** False when this caller has spent its allowance for this path. */
  withinRate(req: Request, key?: string): boolean
  absolute(source: string): string
  /** Sets the session cookie for an opened session. */
  sessionCookie(res: Response, sessionId: string): void
}

export function localeFor(req: Request): string {
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

export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store')
}
