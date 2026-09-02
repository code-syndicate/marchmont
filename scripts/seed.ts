import { loadConfig } from '../src/config'
import { connect, type Database } from '../src/db/client'
import { encodeArea, encodeMoney } from '../src/db/codecs'
import { applySchema } from '../src/db/indexes'
import { areaFromM2 } from '../src/domain/area'
import { parseMoney } from '../src/domain/money'

const PROPERTIES = [
  {
    _id: 'prop-grote-markt',
    slug: 'grote-markt-6',
    buildingType: 'office',
    address: {
      formatted: 'Grote Markt 6, 2000 Antwerp',
      countryCode: 'BE',
      locality: 'Antwerp',
    },
    location: { type: 'Point', coordinates: [4.4025, 51.2213] },
    areaM2: '1240.55',
    floors: 6,
    yearBuilt: 1904,
    summary: 'Six floors off the Grote Markt with north light on every one. Available whole or by floor.',
  },
  {
    _id: 'prop-ikoyi-crescent',
    slug: 'ikoyi-crescent-12',
    buildingType: 'house',
    address: {
      formatted: '12 Ikoyi Crescent, Ikoyi, Lagos',
      countryCode: 'NG',
      locality: 'Lagos',
    },
    location: { type: 'Point', coordinates: [3.4356, 6.4541] },
    areaM2: '480.00',
    floors: 2,
    yearBuilt: 1978,
    summary: 'Four bedroom detached house on a walled plot, with a separate two bedroom guest wing.',
  },
  {
    _id: 'prop-cheyne-walk',
    slug: 'cheyne-walk-41',
    buildingType: 'house',
    address: {
      formatted: '41 Cheyne Walk, London SW3',
      countryCode: 'GB',
      locality: 'London',
    },
    location: { type: 'Point', coordinates: [-0.1712, 51.4831] },
    areaM2: '310.00',
    floors: 4,
    yearBuilt: 1832,
    summary: 'Grade II listed terrace facing the river, arranged over four floors with a walled garden.',
  },
]

const OFFERS = [
  {
    _id: 'offer-grote-markt-lease',
    propertyId: 'prop-grote-markt',
    type: 'long_lease',
    status: 'live',
    scope: 'floor',
    scopeLabel: 'Second and third floors',
    rentPerMonth: { decimal: '18500.00', currency: 'EUR' },
    minTermMonths: 36,
  },
  {
    _id: 'offer-ikoyi-sale',
    propertyId: 'prop-ikoyi-crescent',
    type: 'sale',
    status: 'live',
    scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '450000000.00', currency: 'NGN' },
    tenure: 'freehold',
  },
  {
    _id: 'offer-cheyne-corporate',
    propertyId: 'prop-cheyne-walk',
    type: 'corporate_let',
    status: 'live',
    scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '32000.00', currency: 'GBP' },
    minTermMonths: 3,
    maxTermMonths: 6,
  },
]

export async function seed(database: Database): Promise<{ properties: number; offers: number }> {
  const properties = database.db.collection('properties')
  const offers = database.db.collection('offers')

  for (const property of PROPERTIES) {
    const { _id, areaM2, ...rest } = property
    // _id must not appear in a replaceOne replacement document.
    await properties.replaceOne(
      { _id: _id as never },
      { ...rest, area: encodeArea(areaFromM2(areaM2)) } as never,
      { upsert: true },
    )
  }

  for (const offer of OFFERS) {
    const { _id, ...rest } = offer
    const document: Record<string, unknown> = { ...rest }
    for (const field of ['price', 'rentPerMonth'] as const) {
      const value = (rest as Record<string, unknown>)[field] as
        | { decimal: string; currency: string }
        | undefined
      if (value) {
        document[field] = encodeMoney(parseMoney(value.decimal, value.currency))
        document.currency = value.currency
      }
    }
    await offers.replaceOne({ _id: _id as never }, document as never, { upsert: true })
  }

  return { properties: PROPERTIES.length, offers: OFFERS.length }
}

if (import.meta.main) {
  const config = loadConfig(process.env)
  const database = await connect(config)
  await applySchema(database.db)
  const counts = await seed(database)
  console.log(`seeded ${counts.properties} properties and ${counts.offers} offers`)
  await database.close()
}
