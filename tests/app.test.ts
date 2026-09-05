import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'node:http'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import type { Database } from '../src/db/client'
import { seed } from '../scripts/seed'
import { dropTestDb, withTestDb } from './helpers/db'

let database: Database
let server: Server
let origin: string
let slug: string

const PUBLIC_URL = 'https://marchmont.test'

beforeAll(async () => {
  database = await withTestDb()
  await seed(database)
  const config = loadConfig({
    NODE_ENV: 'test', PORT: '3000',
    MONGO_URL: 'mongodb://127.0.0.1:27017', MONGO_DB: 'marchmont_test',
    SESSION_SECRET: 'x'.repeat(32),
    PUBLIC_URL,
    IMAGES_PROVIDER: 'sandbox', MAIL_PROVIDER: 'sandbox',
  })
  // listen(0) picks a free port; config.port is unused here because loadConfig
  // rejects 0 as out of range.
  server = createApp({ config, database }).listen(0)
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  slug = (await database.repositories.offers.live())[0]!.slug
})

afterAll(async () => {
  server.close()
  await dropTestDb(database)
})

/** Fetches a page and returns its body plus a CSRF token and cookie taken from it. */
async function openForm(path: string): Promise<{ token: string; cookie: string; body: string }> {
  const response = await fetch(`${origin}${path}`)
  const body = await response.text()
  const token = /name="_csrf" value="([^"]+)"/.exec(body)?.[1] ?? ''
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  return { token, cookie, body }
}

function post(path: string, fields: Record<string, string>, cookie: string): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  })
}

describe('health', () => {
  test('reports ready when the database answers', async () => {
    const response = await fetch(`${origin}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ready' })
  })
})

describe('every public page', () => {
  test('renders', async () => {
    const paths = [
      '/', '/portfolio', '/portfolio?type=sale', '/portfolio?type=long_lease',
      '/portfolio?type=corporate_let', '/gallery', '/about', '/contact',
      '/register', '/register/received', '/contact/received',
    ]
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`)
      expect(`${path} ${response.status}`).toBe(`${path} 200`)
      expect((await response.text()).length).toBeGreaterThan(500)
    }
  })

  test('an offer detail page renders for a seeded offer', async () => {
    const response = await fetch(`${origin}/portfolio/${slug}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('</html>')
  })

  test('an offer that does not exist is a 404, not a 500', async () => {
    expect((await fetch(`${origin}/portfolio/no-such-building`)).status).toBe(404)
  })

  test('carries a canonical link and Open Graph tags on every page', async () => {
    for (const path of ['/', '/portfolio', '/about']) {
      const body = await (await fetch(`${origin}${path}`)).text()
      expect(body).toContain(`<link rel="canonical" href="${PUBLIC_URL}${path}"`)
      expect(body).toContain('property="og:title"')
      expect(body).toContain('property="og:image"')
      expect(body).toContain('name="twitter:card"')
    }
  })
})

describe('portfolio filters', () => {
  test('a tenure that does not exist is a 404 rather than a silent reset', async () => {
    expect((await fetch(`${origin}/portfolio?type=rent-to-own`)).status).toBe(404)
  })

  test('a city filter names a city, not a country', async () => {
    const listings = await (async () => {
      const body = await (await fetch(`${origin}/portfolio`)).text()
      return body
    })()
    expect(listings).toContain('Available properties')

    const properties = await database.repositories.properties.all()
    const locality = properties[0]!.address.locality
    const response = await fetch(`${origin}/portfolio?city=${encodeURIComponent(locality)}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(`in ${locality}`)
  })

  test('a city we do not hold anything in is a 404', async () => {
    expect((await fetch(`${origin}/portfolio?city=Atlantis`)).status).toBe(404)
  })
})

describe('registration', () => {
  const valid = {
    name: 'Aoife Brennan',
    email: 'aoife@example.com',
    intent: 'long_lease',
    market: 'GB',
    requirement: 'Two floors, about 400 square metres, from March.',
    password: 'a-long-enough-passphrase',
  }

  test('a complete submission is stored as pending and redirects to a confirmation', async () => {
    const { token, cookie } = await openForm('/register')
    const response = await post('/register', { ...valid, _csrf: token }, cookie)

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/register/received')

    const stored = await database.repositories.users.byEmail('aoife@example.com')
    expect(stored?.accountStatus).toBe('pending')
    expect(stored?.requirement).toBe(valid.requirement)
  })

  test('the submission is audited', async () => {
    const stored = await database.repositories.users.byEmail('aoife@example.com')
    const trail = await database.repositories.audit.forSubject(`user:${stored!.id}`)
    expect(trail.map((entry) => entry.action)).toContain('registration.submitted')
  })

  test('an invalid submission comes back with the errors and what was typed', async () => {
    const { token, cookie } = await openForm('/register')
    const response = await post('/register', { ...valid, email: 'not-an-address', _csrf: token }, cookie)
    const body = await response.text()

    expect(response.status).toBe(422)
    expect(body).toContain('Enter an email address we can reply to.')
    expect(body).toContain('value="Aoife Brennan"')
    expect(await database.repositories.users.byEmail('not-an-address')).toBeNull()
  })

  test('a password that is too easy to guess comes back with the reason', async () => {
    const { token, cookie } = await openForm('/register')
    const response = await post('/register', { ...valid, email: 'weak@example.com', password: 'short', _csrf: token }, cookie)
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('at least 12 characters')
    expect(await database.repositories.users.byEmail('weak@example.com')).toBeNull()
  })

  test('a submission with no token is refused', async () => {
    const response = await post('/register', { ...valid, email: 'forged@example.com' }, '')
    expect(response.status).toBe(403)
    expect(await database.repositories.users.byEmail('forged@example.com')).toBeNull()
  })

  test('a token from one browser cannot be replayed without its cookie', async () => {
    const { token } = await openForm('/register')
    const response = await post('/register', { ...valid, email: 'replay@example.com', _csrf: token }, 'mc_csrf=wrong')
    expect(response.status).toBe(403)
    expect(await database.repositories.users.byEmail('replay@example.com')).toBeNull()
  })

  test('registering twice does not create a second registrant or leak that the address is known', async () => {
    const { token, cookie } = await openForm('/register')
    const response = await post('/register', { ...valid, _csrf: token }, cookie)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/register/received')
    expect(await database.db.collection('users').countDocuments({ email: 'aoife@example.com' })).toBe(1)
  })
})

describe('enquiries', () => {
  const valid = {
    name: 'Tomas Vidal',
    email: 'tomas@example.com',
    message: 'Is the fourth floor still available from March?',
  }

  test('a complete message is recorded and redirects to a confirmation', async () => {
    const { token, cookie } = await openForm('/contact')
    const response = await post('/contact', { ...valid, _csrf: token }, cookie)

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/contact/received')

    const recent = await database.repositories.enquiries.recent()
    expect(recent[0]!.email).toBe('tomas@example.com')
    expect(recent[0]!.message).toBe(valid.message)
  })

  test('an empty message comes back with the error and keeps the rest', async () => {
    const before = (await database.repositories.enquiries.recent()).length
    const { token, cookie } = await openForm('/contact')
    const response = await post('/contact', { ...valid, message: '', _csrf: token }, cookie)

    expect(response.status).toBe(422)
    expect(await response.text()).toContain('value="Tomas Vidal"')
    expect((await database.repositories.enquiries.recent()).length).toBe(before)
  })

  test('a message with no token is refused', async () => {
    const before = (await database.repositories.enquiries.recent()).length
    expect((await post('/contact', valid, '')).status).toBe(403)
    expect((await database.repositories.enquiries.recent()).length).toBe(before)
  })
})

describe('crawlers', () => {
  test('robots.txt points at the sitemap on the configured origin', async () => {
    const response = await fetch(`${origin}/robots.txt`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain(`Sitemap: ${PUBLIC_URL}/sitemap.xml`)
  })

  test('the sitemap lists the pages and every live offer, at absolute URLs', async () => {
    const response = await fetch(`${origin}/sitemap.xml`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('xml')

    const body = await response.text()
    for (const path of ['/', '/portfolio', '/gallery', '/about', '/register', '/contact']) {
      expect(body).toContain(`<loc>${PUBLIC_URL}${path}</loc>`)
    }
    for (const offer of await database.repositories.offers.live()) {
      expect(body).toContain(`<loc>${PUBLIC_URL}/portfolio/${offer.slug}</loc>`)
    }
  })
})

describe('sandbox photography', () => {
  test('every image the pages reference is actually served', async () => {
    const body = await (await fetch(`${origin}/portfolio`)).text()
    const sources = [...body.matchAll(/src="(\/images\/[^"]+)"/g)].map((match) => match[1]!)
    expect(sources.length).toBeGreaterThan(0)

    for (const source of new Set(sources)) {
      const response = await fetch(`${origin}${source}`)
      expect(`${source} ${response.status}`).toBe(`${source} 200`)
      expect(response.headers.get('content-type')).toContain('image/svg+xml')
    }
  })

  test('a request the provider never issued is a 404', async () => {
    expect((await fetch(`${origin}/images/not-an-image.txt`)).status).toBe(404)
  })
})

describe('csrf across a real page load', () => {
  // A browser fetches the stylesheet, the fonts and the images straight after
  // the page. Minting a new cookie on each of those rotated the salt out from
  // under the token already rendered, and every form on the site failed. The
  // suite missed it because these tests only ever fetched the HTML.
  test('the token in a page still works after the browser loads its assets', async () => {
    const page = await fetch(`${origin}/register`)
    const token = /name="_csrf" value="([^"]+)"/.exec(await page.text())![1]!
    const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

    for (const asset of ['/app.css', '/favicon.svg']) {
      const response = await fetch(`${origin}${asset}`, { headers: { cookie } })
      const rotated = (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith('mc_csrf='))
      expect(rotated).toBeUndefined()
    }

    const submitted = await post('/register', {
      name: 'Asset Loader', email: 'assets@example.com', intent: 'sale',
      password: 'a-long-enough-passphrase', _csrf: token,
    }, cookie)

    expect(submitted.status).toBe(303)
    expect(await database.repositories.users.byEmail('assets@example.com')).not.toBeNull()
  })

  test('a browser with no cookie at all is given one', async () => {
    const response = await fetch(`${origin}/signin`)
    expect((response.headers.getSetCookie?.() ?? []).some((line) => line.startsWith('mc_csrf='))).toBe(true)
  })
})

describe('security headers', () => {
  test('sends a content security policy with no unsafe directive', async () => {
    const policy = (await fetch(`${origin}/`)).headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'self'")
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
  })

  test('sends the rest of the baseline headers', async () => {
    const headers = (await fetch(`${origin}/`)).headers
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('x-powered-by')).toBeNull()
  })

  test('the csrf cookie is not readable by script and does not travel cross site', async () => {
    const cookie = (await fetch(`${origin}/register`)).headers.get('set-cookie') ?? ''
    expect(cookie).toContain('mc_csrf=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })
})

describe('static assets', () => {
  test('serves the stylesheet', async () => {
    const response = await fetch(`${origin}/app.css`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/css')
  })
})

describe('portfolio search', () => {
  test('free text narrows the listing and stays in the box', async () => {
    const properties = await database.repositories.properties.all()
    const term = properties[0]!.address.locality
    const response = await fetch(`${origin}/portfolio?q=${encodeURIComponent(term)}`)
    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain(`value="${term}"`)
    expect(body).toContain('Showing')
  })

  test('a search matching nothing renders the empty state, not a broken page', async () => {
    const response = await fetch(`${origin}/portfolio?q=zzzznotabuilding`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Nothing available on these terms')
  })

  test('a filter is reflected as the selected option, so the form shows the current search', async () => {
    const body = await (await fetch(`${origin}/portfolio?buildingType=office`)).text()
    expect(body).toMatch(/<option value="office"[^>]*selected/)
  })

  test('every filter combination the form can produce renders', async () => {
    const queries = [
      'type=sale', 'type=long_lease&scope=floor', 'buildingType=mixed', 'tenure=freehold',
      'furnished=furnished', 'bedrooms=2', 'minArea=200', 'termMonths=3',
      'availableBy=2027-01-01', 'sort=area_desc', 'sort=year_asc',
    ]
    for (const query of queries) {
      const response = await fetch(`${origin}/portfolio?${query}`)
      expect(`${query} ${response.status}`).toBe(`${query} 200`)
    }
  })

  test('links on the page carry the rest of the search rather than dropping it', async () => {
    const body = await (await fetch(`${origin}/portfolio?q=mill&buildingType=office`)).text()
    const sortLink = /href="(\/portfolio\?[^"]*sort=area_desc[^"]*)"/.exec(body)?.[1] ?? ''
    expect(sortLink).toContain('q=mill')
    expect(sortLink).toContain('buildingType=office')
  })

  test('a value the portfolio does not offer is a 404', async () => {
    for (const query of ['type=rent_to_own', 'buildingType=castle', 'tenure=perpetual', 'currency=XXX', 'city=Atlantis']) {
      const response = await fetch(`${origin}/portfolio?${query}`)
      expect(`${query} ${response.status}`).toBe(`${query} 404`)
    }
  })

  test('a price control only appears once a market is pinned', async () => {
    const currency = (await database.repositories.offers.live())[0]!.currency
    expect(await (await fetch(`${origin}/portfolio`)).text()).not.toContain('id="minPrice"')
    expect(await (await fetch(`${origin}/portfolio?currency=${currency}`)).text()).toContain('id="minPrice"')
  })

  test('a price sort is offered only once a market is pinned', async () => {
    const currency = (await database.repositories.offers.live())[0]!.currency
    expect(await (await fetch(`${origin}/portfolio`)).text()).not.toContain('sort=price_asc')
    expect(await (await fetch(`${origin}/portfolio?currency=${currency}`)).text()).toContain('sort=price_asc')
  })

  test('asking for a price sort without a market still renders, on the default order', async () => {
    const response = await fetch(`${origin}/portfolio?sort=price_asc`)
    expect(response.status).toBe(200)
  })
})

describe('gate 1', () => {
  test('an unregistered visitor gets the district, not the street address', async () => {
    const offer = (await database.repositories.offers.live())[0]!
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!

    const body = await (await fetch(`${origin}/portfolio/${offer.slug}`)).text()
    expect(body).toContain(property.address.locality)
    expect(body).not.toContain(property.address.formatted)
  })

  test('says plainly what approval releases, rather than showing an empty section', async () => {
    const slug = (await database.repositories.offers.live())[0]!.slug
    const body = await (await fetch(`${origin}/portfolio/${slug}`)).text()
    expect(body).toContain('released to registered clients')
  })

  test('a locator map is shown, and it is served', async () => {
    const slug = (await database.repositories.offers.live())[0]!.slug
    const body = await (await fetch(`${origin}/portfolio/${slug}`)).text()
    const src = /src="(\/maps\/[^"]+)"/.exec(body)?.[1]
    expect(src).toBeTruthy()

    const map = await fetch(`${origin}${src}`)
    expect(map.status).toBe(200)
    expect(map.headers.get('content-type')).toContain('image/svg+xml')
  })

  test('the map an unregistered visitor gets does not carry the exact coordinate', async () => {
    const offer = (await database.repositories.offers.live())[0]!
    const property = (await database.repositories.properties.byIds([offer.propertyId])).get(offer.propertyId)!
    const body = await (await fetch(`${origin}/portfolio/${offer.slug}`)).text()
    const src = /src="(\/maps\/[^"]+)"/.exec(body)?.[1] ?? ''

    for (const coordinate of property.coordinates) {
      expect(src).not.toContain(String(coordinate))
    }
  })

  test('a map request the provider never issued is a 404', async () => {
    expect((await fetch(`${origin}/maps/not-a-map.txt`)).status).toBe(404)
  })
})

describe('flood protection', () => {
  // Last, because it deliberately exhausts the allowance for this path and a
  // later submission from the same address would then be refused.
  test('a flood of submissions from one address is refused', async () => {
    const { token, cookie } = await openForm('/contact')
    let refused = 0
    for (let attempt = 0; attempt < 40 && refused === 0; attempt += 1) {
      const response = await post('/contact', { name: 'A B', email: 'a@example.com', message: 'x'.repeat(20), _csrf: token }, cookie)
      if (response.status === 429) refused += 1
    }
    expect(refused).toBe(1)
  })
})

describe('errors', () => {
  test('an unknown route renders a 404 page, not a stack trace', async () => {
    const response = await fetch(`${origin}/nothing-here`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Page not found')
  })
})
