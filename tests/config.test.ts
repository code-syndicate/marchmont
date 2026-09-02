import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'marchmont_test',
  SESSION_SECRET: 'x'.repeat(32),
  PAYMENTS_PROVIDER: 'sandbox',
  GEOCODING_PROVIDER: 'sandbox',
  MAIL_PROVIDER: 'sandbox',
}

describe('loadConfig', () => {
  test('accepts a complete environment', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(3000)
    expect(config.mongoDb).toBe('marchmont_test')
    expect(config.providers.payments).toBe('sandbox')
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

  test('refuses to boot production with a sandbox provider', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(/sandbox/i)
  })

  test('allows production with real providers', () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      PAYMENTS_PROVIDER: 'stripe',
      GEOCODING_PROVIDER: 'mapbox',
      MAIL_PROVIDER: 'postmark',
    })
    expect(config.nodeEnv).toBe('production')
  })
})
