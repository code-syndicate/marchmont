import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'node:http'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import type { Database } from '../src/db/client'
import { dropTestDb, withTestDb } from './helpers/db'

let database: Database
let server: Server
let origin: string

beforeAll(async () => {
  database = await withTestDb()
  const config = loadConfig({
    NODE_ENV: 'test', PORT: '3000',
    MONGO_URL: 'mongodb://127.0.0.1:27017', MONGO_DB: 'marchmont_test',
    SESSION_SECRET: 'x'.repeat(32),
    PAYMENTS_PROVIDER: 'sandbox', GEOCODING_PROVIDER: 'sandbox', MAIL_PROVIDER: 'sandbox',
  })
  // listen(0) picks a free port; config.port is unused here because loadConfig
  // rejects 0 as out of range.
  server = createApp({ config, database }).listen(0)
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(async () => {
  server.close()
  await dropTestDb(database)
})

describe('health', () => {
  test('reports ready when the database answers', async () => {
    const response = await fetch(`${origin}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ready' })
  })
})

describe('security headers', () => {
  test('sends a content security policy with no unsafe directive', async () => {
    const policy = (await fetch(`${origin}/health`)).headers.get('content-security-policy')
    expect(policy).toBeTruthy()
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
  })

  test('sends the rest of the baseline headers', async () => {
    const headers = (await fetch(`${origin}/health`)).headers
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-powered-by')).toBeNull()
  })
})

describe('static assets', () => {
  test('serves the stylesheet', async () => {
    const response = await fetch(`${origin}/app.css`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/css')
  })
})

describe('errors', () => {
  test('an unknown route renders a 404 page, not a stack trace', async () => {
    const response = await fetch(`${origin}/no-such-page`)
    expect(response.status).toBe(404)
    const body = await response.text()
    expect(body).not.toContain('at Object')
    expect(body).not.toMatch(/[–—]/)
  })
})
