import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'marchmont_test',
  SESSION_SECRET: 'x'.repeat(32),
  IMAGES_PROVIDER: 'sandbox',
}

describe('loadConfig', () => {
  test('accepts a complete environment', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(3000)
    expect(config.mongoDb).toBe('marchmont_test')
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
