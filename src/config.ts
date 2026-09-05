export type NodeEnv = 'development' | 'production' | 'test'

export type Config = {
  readonly nodeEnv: NodeEnv
  readonly port: number
  readonly mongoUrl: string
  readonly mongoDb: string
  readonly sessionSecret: string
  /** Absolute origin the site is served from. Canonical links, Open Graph and the sitemap need it. */
  readonly publicUrl: string
  readonly providers: {
    /** Photography. 'unsplash' in production, 'sandbox' offline. */
    readonly images: ImagesProvider
    /** Locator maps. 'osm' in production, 'sandbox' offline. */
    readonly maps: MapsProvider
    /** Mail. 'log' writes each message to the service log, 'sandbox' records it in memory. */
    readonly mail: MailProvider
  }
}

export type ImagesProvider = 'unsplash' | 'sandbox'
export type MapsProvider = 'osm' | 'sandbox'
export type MailProvider = 'log' | 'sandbox'

export class ConfigError extends Error {
  readonly code = 'CONFIG_INVALID'
  constructor(problems: string[]) {
    super(`Configuration is invalid:\n  ${problems.join('\n  ')}`)
    this.name = 'ConfigError'
  }
}

const NODE_ENVS: readonly string[] = ['development', 'production', 'test']
const IMAGES_PROVIDERS: readonly string[] = ['unsplash', 'sandbox']
const MAPS_PROVIDERS: readonly string[] = ['osm', 'sandbox']
const MAIL_PROVIDERS: readonly string[] = ['log', 'sandbox']

export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = []

  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}, got "${nodeEnv}"`)
  }

  const rawPort = env.PORT ?? '3000'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be an integer between 1 and 65535, got "${rawPort}"`)
  }

  const mongoUrl = env.MONGO_URL
  if (!mongoUrl) problems.push('MONGO_URL is required')
  else if (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://')) {
    problems.push('MONGO_URL must start with mongodb:// or mongodb+srv://')
  }

  const mongoDb = env.MONGO_DB
  if (!mongoDb) problems.push('MONGO_DB is required')

  const sessionSecret = env.SESSION_SECRET
  if (!sessionSecret) problems.push('SESSION_SECRET is required')
  else if (sessionSecret.length < 32) {
    problems.push(`SESSION_SECRET must be at least 32 characters, got ${sessionSecret.length}`)
  }

  // Canonical URLs, Open Graph tags and the sitemap have to be absolute, and
  // a request's Host header is attacker controlled, so the origin is
  // configuration rather than something derived per request.
  const rawPublicUrl = env.PUBLIC_URL ?? `http://localhost:${Number.isInteger(port) ? port : 3000}`
  let publicUrl = ''
  try {
    const parsed = new URL(rawPublicUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      problems.push(`PUBLIC_URL must be an http or https URL, got "${rawPublicUrl}"`)
    }
    publicUrl = parsed.origin
  } catch {
    problems.push(`PUBLIC_URL must be an absolute URL, got "${rawPublicUrl}"`)
  }

  // Only providers that actually have an implementation are validated here.
  // Requiring a payments or mail provider before either exists would block a
  // deploy on a setting nothing reads.
  //
  // The sandbox provider is allowed in production. It serves photography from
  // /images with no network, which is a legitimate way to run this site.
  const imagesProvider = env.IMAGES_PROVIDER ?? 'sandbox'
  if (!IMAGES_PROVIDERS.includes(imagesProvider)) {
    problems.push(`IMAGES_PROVIDER must be one of ${IMAGES_PROVIDERS.join(', ')}, got "${imagesProvider}"`)
  }
  const mapsProvider = env.MAPS_PROVIDER ?? 'sandbox'
  if (!MAPS_PROVIDERS.includes(mapsProvider)) {
    problems.push(`MAPS_PROVIDER must be one of ${MAPS_PROVIDERS.join(', ')}, got "${mapsProvider}"`)
  }

  const mailProvider = env.MAIL_PROVIDER ?? 'log'
  if (!MAIL_PROVIDERS.includes(mailProvider)) {
    problems.push(`MAIL_PROVIDER must be one of ${MAIL_PROVIDERS.join(', ')}, got "${mailProvider}"`)
  }

  const providers = {
    images: imagesProvider as ImagesProvider,
    maps: mapsProvider as MapsProvider,
    mail: mailProvider as MailProvider,
  }

  if (problems.length > 0) throw new ConfigError(problems)

  return {
    nodeEnv: nodeEnv as NodeEnv,
    port,
    mongoUrl: mongoUrl!,
    mongoDb: mongoDb!,
    sessionSecret: sessionSecret!,
    publicUrl,
    providers,
  }
}
