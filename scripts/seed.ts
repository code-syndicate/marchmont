import { loadConfig } from '../src/config'
import { connect, type Database } from '../src/db/client'
import { encodeArea, encodeMoney } from '../src/db/codecs'
import { applySchema } from '../src/db/indexes'
import { areaFromM2 } from '../src/domain/area'
import { parseMoney } from '../src/domain/money'

type Seeded = { _id: string; areaM2: string; [key: string]: unknown }

const PROPERTIES: Seeded[] = [
  {
    _id: 'prop-grote-markt',
    slug: 'grote-markt-6',
    name: 'Grote Markt 6',
    buildingType: 'office',
    address: { formatted: 'Grote Markt 6, 2000 Antwerp', countryCode: 'BE', locality: 'Antwerp' },
    location: { type: 'Point', coordinates: [4.4025, 51.2213] },
    coordinates: [4.4025, 51.2213],
    areaM2: '1240.55',
    floors: 6,
    yearBuilt: 1904,
    energyRating: 'B',
    summary: 'Six floors off the Grote Markt with north light on every one. Available whole or by floor.',
    description: [
      'A guild house rebuilt in 1904 on a medieval plot, six storeys over a vaulted basement. The stair is original, the lift was replaced in 2019, and the north elevation carries the tall sash windows the upper floors were designed around.',
      'Floors two and three are offered together and share a services riser. Both are open plate with the original cast iron columns left exposed. The fit out is category A, so partitioning is the tenant’s to decide.',
    ],
    features: [
      'North light on every floor',
      'Original cast iron columns',
      'Lift replaced 2019',
      'Vaulted basement storage',
      'Bicycle store for 24',
      'Three minutes from Groenplaats',
    ],
  },
  {
    _id: 'prop-ikoyi-crescent',
    slug: 'ikoyi-crescent-12',
    name: '12 Ikoyi Crescent',
    buildingType: 'house',
    address: { formatted: '12 Ikoyi Crescent, Ikoyi, Lagos', countryCode: 'NG', locality: 'Lagos' },
    location: { type: 'Point', coordinates: [3.4356, 6.4541] },
    coordinates: [3.4356, 6.4541],
    areaM2: '480.00',
    floors: 2,
    yearBuilt: 1978,
    bedrooms: 4,
    bathrooms: 4,
    summary: 'Four bedroom detached house on a walled plot, with a separate two bedroom guest wing.',
    description: [
      'Built in 1978 and held by one family since, the house sits well back from the crescent behind a mature screen of frangipani. The plot runs to just under a third of an acre and is walled on all four sides.',
      'Accommodation is arranged over two floors with the principal rooms facing the garden. A separate two bedroom wing off the courtyard has its own entrance and kitchen.',
    ],
    features: [
      'Walled plot of 0.3 acres',
      'Separate two bedroom guest wing',
      'Borehole and treatment plant',
      '60 kVA standby generator',
      'Staff accommodation',
      'Parking for six',
    ],
  },
  {
    _id: 'prop-cheyne-walk',
    slug: 'cheyne-walk-41',
    name: '41 Cheyne Walk',
    buildingType: 'house',
    address: { formatted: '41 Cheyne Walk, London SW3', countryCode: 'GB', locality: 'London' },
    location: { type: 'Point', coordinates: [-0.1712, 51.4831] },
    coordinates: [-0.1712, 51.4831],
    areaM2: '310.00',
    floors: 4,
    yearBuilt: 1832,
    bedrooms: 5,
    bathrooms: 3,
    energyRating: 'D',
    summary: 'Grade II listed terrace facing the river, arranged over four floors with a walled garden.',
    description: [
      'One of the 1832 terrace, listed Grade II, with the original railings and fanlight intact. The house faces south across the Embankment to the river.',
      'Four floors over a lower ground, with the drawing room at first floor level running the full width and opening onto a balcony. The garden is walled and laid to stone.',
    ],
    features: [
      'Grade II listed',
      'South facing over the river',
      'Original 1832 joinery',
      'Walled garden',
      'Lower ground kitchen and utility',
      'Residents parking',
    ],
  },
  {
    _id: 'prop-prinsengracht',
    slug: 'prinsengracht-421',
    name: 'Prinsengracht 421',
    buildingType: 'house',
    address: { formatted: 'Prinsengracht 421, 1016 HM Amsterdam', countryCode: 'NL', locality: 'Amsterdam' },
    location: { type: 'Point', coordinates: [4.8836, 52.3702] },
    coordinates: [4.8836, 52.3702],
    areaM2: '265.00',
    floors: 4,
    yearBuilt: 1671,
    bedrooms: 3,
    bathrooms: 2,
    energyRating: 'E',
    summary: 'A 1671 canal house with its hoist beam and stair intact, four floors over a souterrain.',
    description: [
      'Built in 1671 and restored in 2016 under monument supervision. The neck gable, hoist beam and main stair are original; the services are not.',
      'The bel etage keeps its full height and stucco ceiling. The souterrain opens to a courtyard garden at the rear, which is unusually deep for the stretch.',
    ],
    features: [
      'Rijksmonument',
      'Original 1671 neck gable',
      'Restored 2016',
      'Courtyard garden',
      'Canal frontage',
      'Souterrain with separate entrance',
    ],
  },
  {
    _id: 'prop-alecrim',
    slug: 'rua-do-alecrim-22',
    name: 'Rua do Alecrim 22',
    buildingType: 'office',
    address: { formatted: 'Rua do Alecrim 22, 1200-292 Lisbon', countryCode: 'PT', locality: 'Lisbon' },
    location: { type: 'Point', coordinates: [-9.1436, 38.7099] },
    coordinates: [-9.1436, 38.7099],
    areaM2: '890.00',
    floors: 5,
    yearBuilt: 1890,
    energyRating: 'C',
    summary: 'Five floors in Cais do Sodre, azulejo entrance hall, roof terrace over the river.',
    description: [
      'A late nineteenth century commercial building on the climb out of Cais do Sodre. The entrance hall keeps its original azulejo to shoulder height.',
      'Floors are compact and column free, which suits teams of twelve to twenty. The roof terrace runs the full footprint and looks south over the Tejo.',
    ],
    features: [
      'Roof terrace over the Tejo',
      'Original azulejo entrance',
      'Column free floor plates',
      'Fibre to the building',
      'Two minutes from Cais do Sodre station',
      'Air conditioning throughout',
    ],
  },
  {
    _id: 'prop-marignan',
    slug: 'rue-de-marignan-2',
    name: '2 Rue de Marignan',
    buildingType: 'office',
    address: { formatted: '2 Rue de Marignan, 75008 Paris', countryCode: 'FR', locality: 'Paris' },
    location: { type: 'Point', coordinates: [2.3053, 48.8698] },
    coordinates: [2.3053, 48.8698],
    areaM2: '1560.00',
    floors: 7,
    yearBuilt: 1928,
    energyRating: 'B',
    summary: 'Haussmann corner building off the Champs Elysees, seven floors, two courtyards.',
    description: [
      'A 1928 corner building of stone construction, seven floors around two courtyards. The principal stair is marble and the original lift cage has been retained alongside a modern car.',
      'The fourth floor is offered whole. It runs to 240 square metres with windows on two elevations and a balcony to the Rue de Marignan side.',
    ],
    features: [
      'Stone construction',
      'Two internal courtyards',
      'Original lift cage retained',
      'Balcony to the fourth floor',
      'Concierge',
      'Franklin D. Roosevelt on line 1 and 9',
    ],
  },
  {
    _id: 'prop-banana-island',
    slug: 'banana-island-road-9',
    name: '9 Banana Island Road',
    buildingType: 'house',
    address: { formatted: '9 Banana Island Road, Ikoyi, Lagos', countryCode: 'NG', locality: 'Lagos' },
    location: { type: 'Point', coordinates: [3.4407, 6.4462] },
    coordinates: [3.4407, 6.4462],
    areaM2: '720.00',
    floors: 3,
    yearBuilt: 2015,
    bedrooms: 6,
    bathrooms: 7,
    summary: 'Six bedroom house built in 2015, three floors, pool and a separate staff block.',
    description: [
      'Built in 2015 to a brief that put the principal rooms on the first floor to catch the lagoon breeze. Three floors, with a lift serving all of them.',
      'The plot is level and fully landscaped, with a twelve metre pool along the eastern boundary and a separate block for staff and plant.',
    ],
    features: [
      'Lift to all three floors',
      'Twelve metre pool',
      'Separate staff and plant block',
      '100 kVA standby generator',
      'Borehole and treatment plant',
      'Estate security',
    ],
  },
  {
    _id: 'prop-borgospesso',
    slug: 'via-borgospesso-14',
    name: 'Via Borgospesso 14',
    buildingType: 'house',
    address: { formatted: 'Via Borgospesso 14, 20121 Milan', countryCode: 'IT', locality: 'Milan' },
    location: { type: 'Point', coordinates: [9.1927, 45.4692] },
    coordinates: [9.1927, 45.4692],
    areaM2: '340.00',
    floors: 3,
    yearBuilt: 1901,
    bedrooms: 4,
    bathrooms: 3,
    energyRating: 'D',
    summary: 'Piano nobile apartment in a 1901 palazzo, four metre ceilings, courtyard aspect.',
    description: [
      'The piano nobile of a 1901 palazzo in the Quadrilatero, reached by the original stair or the lift added in the 1960s.',
      'Ceilings run to four metres and the enfilade of three reception rooms faces the courtyard rather than the street, which keeps the apartment quiet.',
    ],
    features: [
      'Four metre ceilings',
      'Enfilade of three reception rooms',
      'Courtyard aspect',
      'Original parquet',
      'Portineria',
      'Cellar and garage space',
    ],
  },
  {
    _id: 'prop-tanjong-pagar',
    slug: 'tanjong-pagar-88',
    name: '88 Tanjong Pagar Road',
    buildingType: 'mixed',
    address: { formatted: '88 Tanjong Pagar Road, Singapore 088512', countryCode: 'SG', locality: 'Singapore' },
    location: { type: 'Point', coordinates: [103.8443, 1.2765] },
    coordinates: [103.8443, 1.2765],
    areaM2: '2100.00',
    floors: 12,
    yearBuilt: 1994,
    energyRating: 'A',
    summary: 'Twelve floors behind a conserved shophouse frontage, offices above, two residences at the top.',
    description: [
      'A 1994 tower set behind a conserved 1920s shophouse frontage, which is retained in full and forms the entrance.',
      'Floors three to ten are office. The eleventh and twelfth are two residences with private lift access and a shared roof garden.',
    ],
    features: [
      'Conserved shophouse frontage',
      'Private lift to the residences',
      'Shared roof garden',
      'End of trip facilities',
      'Green Mark Platinum',
      'Tanjong Pagar MRT at the door',
    ],
  },
]

type SeededOffer = { _id: string; [key: string]: unknown }

const OFFERS: SeededOffer[] = [
  {
    _id: 'offer-grote-markt-lease',
    slug: 'grote-markt-6-second-and-third-floors',
    propertyId: 'prop-grote-markt',
    type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Second and third floors',
    rentPerMonth: { decimal: '18500.00', currency: 'EUR' },
    serviceCharge: { decimal: '42000.00', currency: 'EUR' },
    deposit: { decimal: '55500.00', currency: 'EUR' },
    minTermMonths: 36,
    furnished: 'unfurnished',
    availableFrom: '2026-11-01',
  },
  {
    _id: 'offer-grote-markt-sale',
    slug: 'grote-markt-6-freehold',
    propertyId: 'prop-grote-markt',
    type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '8750000.00', currency: 'EUR' },
    tenure: 'freehold',
    chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-ikoyi-sale',
    slug: 'ikoyi-crescent-12-freehold',
    propertyId: 'prop-ikoyi-crescent',
    type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '450000000.00', currency: 'NGN' },
    tenure: 'freehold',
    chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-cheyne-corporate',
    slug: 'cheyne-walk-41-corporate-let',
    propertyId: 'prop-cheyne-walk',
    type: 'corporate_let', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '32000.00', currency: 'GBP' },
    deposit: { decimal: '64000.00', currency: 'GBP' },
    minTermMonths: 3, maxTermMonths: 6,
    furnished: 'furnished',
    servicedLevel: 'Weekly housekeeping included',
    billsIncluded: ['Council tax', 'Water', 'Broadband'],
    availableFrom: '2026-10-01',
    availableUntil: '2027-06-30',
  },
  {
    _id: 'offer-cheyne-sale',
    slug: 'cheyne-walk-41-freehold',
    propertyId: 'prop-cheyne-walk',
    type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '11250000.00', currency: 'GBP' },
    tenure: 'freehold',
    chainStatus: 'Chain free',
  },
  {
    _id: 'offer-prinsengracht-sale',
    slug: 'prinsengracht-421-freehold',
    propertyId: 'prop-prinsengracht',
    type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '4400000.00', currency: 'EUR' },
    tenure: 'freehold',
  },
  {
    _id: 'offer-alecrim-lease',
    slug: 'rua-do-alecrim-22-third-and-fourth-floors',
    propertyId: 'prop-alecrim',
    type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Third and fourth floors',
    rentPerMonth: { decimal: '9800.00', currency: 'EUR' },
    serviceCharge: { decimal: '14400.00', currency: 'EUR' },
    deposit: { decimal: '29400.00', currency: 'EUR' },
    minTermMonths: 24,
    furnished: 'part furnished',
    availableFrom: '2026-09-15',
  },
  {
    _id: 'offer-marignan-lease',
    slug: 'rue-de-marignan-2-fourth-floor',
    propertyId: 'prop-marignan',
    type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Fourth floor',
    rentPerMonth: { decimal: '31000.00', currency: 'EUR' },
    serviceCharge: { decimal: '68000.00', currency: 'EUR' },
    deposit: { decimal: '93000.00', currency: 'EUR' },
    minTermMonths: 36,
    furnished: 'unfurnished',
    availableFrom: '2027-01-04',
  },
  {
    _id: 'offer-banana-island-sale',
    slug: 'banana-island-road-9-leasehold',
    propertyId: 'prop-banana-island',
    type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '1850000000.00', currency: 'NGN' },
    tenure: 'leasehold',
    leaseYearsRemaining: 87,
    chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-borgospesso-corporate',
    slug: 'via-borgospesso-14-corporate-let',
    propertyId: 'prop-borgospesso',
    type: 'corporate_let', status: 'live', scope: 'unit',
    scopeLabel: 'Piano nobile',
    rentPerMonth: { decimal: '14500.00', currency: 'EUR' },
    deposit: { decimal: '29000.00', currency: 'EUR' },
    minTermMonths: 2, maxTermMonths: 6,
    furnished: 'furnished',
    servicedLevel: 'Fortnightly housekeeping included',
    billsIncluded: ['Condominio', 'Water', 'Broadband'],
    availableFrom: '2026-09-20',
  },
  {
    _id: 'offer-tanjong-pagar-lease',
    slug: 'tanjong-pagar-88-sixth-to-eighth-floors',
    propertyId: 'prop-tanjong-pagar',
    type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Sixth to eighth floors',
    rentPerMonth: { decimal: '78000.00', currency: 'SGD' },
    serviceCharge: { decimal: '156000.00', currency: 'SGD' },
    deposit: { decimal: '234000.00', currency: 'SGD' },
    minTermMonths: 36,
    furnished: 'unfurnished',
    availableFrom: '2026-12-01',
  },
  {
    _id: 'offer-tanjong-pagar-residence',
    slug: 'tanjong-pagar-88-twelfth-floor-residence',
    propertyId: 'prop-tanjong-pagar',
    type: 'sale', status: 'live', scope: 'unit',
    scopeLabel: 'Twelfth floor residence',
    price: { decimal: '9600000.00', currency: 'SGD' },
    tenure: 'leasehold',
    leaseYearsRemaining: 68,
  },
]

const MONEY_FIELDS = ['price', 'rentPerMonth', 'deposit', 'serviceCharge'] as const

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
    for (const field of MONEY_FIELDS) {
      const value = rest[field] as { decimal: string; currency: string } | undefined
      if (!value) continue
      document[field] = encodeMoney(parseMoney(value.decimal, value.currency))
      if (field === 'price' || field === 'rentPerMonth') document.currency = value.currency
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
