import { describe, expect, test } from 'bun:test'
import { ConfigError, loadConfig } from '../src/config'

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'nashluxuryrealty_test',
  SESSION_SECRET: 'x'.repeat(32),
  IMAGES_PROVIDER: 'sandbox',
}

describe('loadConfig', () => {
  test('accepts a complete environment', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(3000)
    expect(config.mongoDb).toBe('nashluxuryrealty_test')
    expect(config.providers.images).toBe('sandbox')
  })

  test('reports every missing variable at once, not just the first', () => {
    const { MONGO_URL, SESSION_SECRET, ...rest } = valid
    try {
      loadConfig(rest)
      throw new Error('expected loadConfig to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('MONGO_URL')
      expect(message).toContain('SESSION_SECRET')
    }
  })

  test('rejects a non-numeric port', () => {
    expect(() => loadConfig({ ...valid, PORT: 'eighty' })).toThrow(/PORT/)
  })

  test('rejects a short session secret', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  test('allows the sandbox provider in production', () => {
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).providers.images).toBe('sandbox')
  })

  test('allows production with the network provider', () => {
    const config = loadConfig({ ...valid, NODE_ENV: 'production', IMAGES_PROVIDER: 'unsplash' })
    expect(config.nodeEnv).toBe('production')
    expect(config.providers.images).toBe('unsplash')
  })

  test('rejects an unknown images provider', () => {
    expect(() => loadConfig({ ...valid, IMAGES_PROVIDER: 'flickr' })).toThrow(/IMAGES_PROVIDER/)
  })

  test('defaults to the sandbox provider outside production', () => {
    const { IMAGES_PROVIDER, ...rest } = valid
    expect(loadConfig(rest).providers.images).toBe('sandbox')
  })
})

describe('the public origin', () => {
  test('defaults to localhost on the configured port', () => {
    const config = loadConfig({ ...valid, PORT: '4100', PUBLIC_URL: undefined })
    expect(config.publicUrl).toBe('http://localhost:4100')
  })

  test('keeps the origin and drops any path, so a canonical URL cannot double up', () => {
    expect(loadConfig({ ...valid, PUBLIC_URL: 'https://nashluxuryrealty.com/site/' }).publicUrl).toBe('https://nashluxuryrealty.com')
  })

  test('rejects a value that is not an absolute http or https URL', () => {
    for (const PUBLIC_URL of ['nashluxuryrealty.com', 'ftp://nashluxuryrealty.com', '/portfolio']) {
      expect(() => loadConfig({ ...valid, PUBLIC_URL })).toThrow(ConfigError)
    }
  })
})

describe('the maps provider', () => {
  test('defaults to the sandbox, which needs no network', () => {
    expect(loadConfig({ ...valid, MAPS_PROVIDER: undefined }).providers.maps).toBe('sandbox')
  })

  test('accepts the tile provider', () => {
    expect(loadConfig({ ...valid, MAPS_PROVIDER: 'osm' }).providers.maps).toBe('osm')
  })

  test('rejects a provider with no implementation behind it', () => {
    expect(() => loadConfig({ ...valid, MAPS_PROVIDER: 'google' })).toThrow(ConfigError)
  })
})

describe('the mail provider', () => {
  test('defaults to the log, so a link can always be recovered', () => {
    expect(loadConfig({ ...valid, MAIL_PROVIDER: undefined }).providers.mail).toBe('log')
  })

  test('accepts the sandbox', () => {
    expect(loadConfig({ ...valid, MAIL_PROVIDER: 'sandbox' }).providers.mail).toBe('sandbox')
  })

  test('rejects a provider with no implementation behind it', () => {
    expect(() => loadConfig({ ...valid, MAIL_PROVIDER: 'sendgrid' })).toThrow(ConfigError)
  })
})
