export type NodeEnv = 'development' | 'production' | 'test'

export type Config = {
  readonly nodeEnv: NodeEnv
  readonly port: number
  readonly mongoUrl: string
  readonly mongoDb: string
  readonly sessionSecret: string
  readonly providers: {
    readonly payments: string
    readonly geocoding: string
    readonly mail: string
  }
}

export class ConfigError extends Error {
  readonly code = 'CONFIG_INVALID'
  constructor(problems: string[]) {
    super(`Configuration is invalid:\n  ${problems.join('\n  ')}`)
    this.name = 'ConfigError'
  }
}

const NODE_ENVS: readonly string[] = ['development', 'production', 'test']

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

  const providers = {
    payments: env.PAYMENTS_PROVIDER ?? '',
    geocoding: env.GEOCODING_PROVIDER ?? '',
    mail: env.MAIL_PROVIDER ?? '',
  }
  for (const [name, value] of Object.entries(providers)) {
    if (!value) problems.push(`${name.toUpperCase()}_PROVIDER is required`)
  }

  if (nodeEnv === 'production') {
    for (const [name, value] of Object.entries(providers)) {
      if (value === 'sandbox') {
        problems.push(`${name.toUpperCase()}_PROVIDER is "sandbox"; production refuses to boot with a sandbox provider`)
      }
    }
  }

  if (problems.length > 0) throw new ConfigError(problems)

  return {
    nodeEnv: nodeEnv as NodeEnv,
    port,
    mongoUrl: mongoUrl!,
    mongoDb: mongoDb!,
    sessionSecret: sessionSecret!,
    providers,
  }
}
