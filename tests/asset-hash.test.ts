import { afterEach, describe, expect, test } from 'bun:test'
import { unlinkSync, writeFileSync } from 'node:fs'
import { loadConfig } from '../src/config'
import { createAssetHasher } from '../src/asset-hash'

// Production configs below name real providers because loadConfig refuses to
// boot production on a sandbox one.
const base = {
  PORT: '3000',
  MONGO_URL: 'mongodb://127.0.0.1:27017',
  MONGO_DB: 'marchmont_test',
  SESSION_SECRET: 'x'.repeat(32),
  IMAGES_PROVIDER: 'sandbox',
}

const probe = new URL('../public/hash-probe.css', import.meta.url).pathname
afterEach(() => { try { unlinkSync(probe) } catch {} })

describe('createAssetHasher', () => {
  test('produces a stable href for app.css', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'production', IMAGES_PROVIDER: 'unsplash' }))
    expect(hasher.cssHref()).toMatch(/^\/app\.css\?v=[0-9a-f]{8}$/)
    expect(hasher.cssHref()).toBe(hasher.cssHref())
  })

  test('in development the hash follows an edit to the file', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'development' }), 'hash-probe.css')
    writeFileSync(probe, 'a{color:red}')
    const before = hasher.cssHref()
    writeFileSync(probe, 'a{color:blue}')
    expect(hasher.cssHref()).not.toBe(before)
  })

  test('in production the hash is computed once and cached', () => {
    const hasher = createAssetHasher(loadConfig({ ...base, NODE_ENV: 'production', IMAGES_PROVIDER: 'unsplash' }), 'hash-probe.css')
    writeFileSync(probe, 'a{color:red}')
    const before = hasher.cssHref()
    writeFileSync(probe, 'a{color:blue}')
    expect(hasher.cssHref()).toBe(before)
  })
})
