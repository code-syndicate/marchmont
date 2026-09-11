import { loadConfig } from '../src/config'
import { connect, type Database } from '../src/db/client'
import { encodeArea, encodeMoney } from '../src/db/codecs'
import { applySchema } from '../src/db/indexes'
import { areaFromM2 } from '../src/domain/area'
import { parseMoney } from '../src/domain/money'

type Seeded = { _id: string; areaM2: string; [key: string]: unknown }

const PROPERTIES: Seeded[] = [
  {
    _id: 'prop-dumbo',
    slug: 'tigertail-house',
    name: 'Tigertail House',
    buildingType: 'house',
    address: { formatted: '3640 Tigertail Avenue, Miami, FL 33133', countryCode: 'US', locality: 'Miami' },
    timeZone: 'America/New_York',
    location: { type: 'Point', coordinates: [-80.2362, 25.7318] },
    coordinates: [-80.2362, 25.7318],
    areaM2: '780.00',
    floors: 2,
    yearBuilt: 2023,
    bedrooms: 6,
    bathrooms: 7,
    summary: "A house of 2023 on a wooded lot in Coconut Grove, ten minutes on foot from Biscayne Bay.",
    description: [
      "Completed in 2023 on a lot of just under half an acre off Tigertail Avenue. The house is poured concrete with timber cladding and a travertine base, set back behind a slatted fence and a line of mature trees.",
      "The ground floor runs from the kitchen to the family room in one open plan, glazed on both sides. Six bedroom suites are upstairs, each with its own bathroom.",
    ],
    features: [
      "Six bedroom suites",
      "Walnut panelled family room",
      "Pool and garden under mature oaks",
      "Gated parking for four cars",
      "Whole house generator",
      "Ten minutes on foot to the bay",
    ],
    images: [
      { id: 'villa-street-facade', alt: "Two storey house behind a black slatted fence, with white roof slabs and timber cladding", use: 'exterior' },
      { id: 'villa-family-room', alt: "Family room with walnut panelled walls, low sofas and a high band of garden glazing", use: 'serviced' },
      { id: 'villa-bath-vanity', alt: "Principal bathroom vanity in walnut with green glass basins", use: 'detail' },
    ],
  },
  {
    _id: 'prop-tortona',
    slug: 'villa-mirador',
    name: 'Villa Mirador',
    buildingType: 'house',
    address: { formatted: 'Urbanización Sierra Blanca 14, 29602 Marbella', countryCode: 'ES', locality: 'Marbella' },
    timeZone: 'Europe/Madrid',
    location: { type: 'Point', coordinates: [-4.9195, 36.5215] },
    coordinates: [-4.9195, 36.5215],
    areaM2: '650.00',
    floors: 2,
    yearBuilt: 2022,
    bedrooms: 5,
    bathrooms: 6,
    energyRating: 'A',
    summary: "A villa of 2022 in Sierra Blanca, above the Golden Mile, with a covered pool terrace and sea views from the upper floor.",
    description: [
      "Built in 2022 on a south facing plot in Sierra Blanca, one of the gated estates on the hill above the Golden Mile. The house is two floors of travertine and glass under deep white eaves, with the pool terrace on the garden side.",
      "The living room and study are on the ground floor. Five bedroom suites are upstairs, and the principal suite opens onto its own covered terrace.",
    ],
    features: [
      "Covered terrace with outdoor kitchen",
      "Twenty metre pool",
      "Library wall in walnut",
      "Three car garage",
      "Gated estate with a staffed entrance",
      "Puerto Banús ten minutes by car",
    ],
    images: [
      { id: 'villa-pool-terrace', alt: "Covered terrace with an outdoor kitchen beside a long pool, the house beyond", use: 'exterior' },
      { id: 'villa-library-room', alt: "Living room with a walnut shelving wall and floor to ceiling glass", use: 'serviced' },
      { id: 'villa-dressing-room', alt: "Dressing room in walnut with a glass topped island", use: 'detail' },
    ],
  },
  {
    _id: 'prop-houthavens',
    slug: 'casa-da-marinha',
    name: 'Casa da Marinha',
    buildingType: 'house',
    address: { formatted: 'Rua da Quinta da Marinha 12, 2750-715 Cascais', countryCode: 'PT', locality: 'Cascais' },
    timeZone: 'Europe/Lisbon',
    location: { type: 'Point', coordinates: [-9.4575, 38.7055] },
    coordinates: [-9.4575, 38.7055],
    areaM2: '590.00',
    floors: 2,
    yearBuilt: 2023,
    bedrooms: 5,
    bathrooms: 5,
    energyRating: 'A',
    summary: "A house of 2023 in Quinta da Marinha, between Cascais and the Guincho coast, with a gym on the pool level.",
    description: [
      "Completed in 2023 on a walled plot in Quinta da Marinha. The street side is travertine with a long band of glass at the upper floor.",
      "The kitchen, dining room and gym open onto the pool and garden on one level. Five bedroom suites are upstairs. Cascais station and the marina are ten minutes by car.",
    ],
    features: [
      "Kitchen island in oak and stone",
      "Gym opening onto the pool",
      "Travertine wet rooms",
      "Walled garden",
      "Parking for three cars",
      "Ten minutes to Cascais by car",
    ],
    images: [
      { id: 'villa-side-elevation', alt: "Travertine and glass elevation with a first floor terrace", use: 'exterior' },
      { id: 'villa-kitchen', alt: "Kitchen with a long timber island, open to the dining and living areas", use: 'residence' },
      { id: 'villa-gym', alt: "Gym in oak and walnut along a glazed garden wall", use: 'detail' },
    ],
  },
  {
    _id: 'prop-eilandje',
    slug: 'villa-les-oliviers',
    name: 'Villa Les Oliviers',
    buildingType: 'house',
    address: { formatted: '12 Avenue Jean Mermoz, 06230 Saint-Jean-Cap-Ferrat', countryCode: 'FR', locality: 'Saint-Jean-Cap-Ferrat' },
    timeZone: 'Europe/Paris',
    location: { type: 'Point', coordinates: [7.3335, 43.6875] },
    coordinates: [7.3335, 43.6875],
    areaM2: '720.00',
    floors: 2,
    yearBuilt: 2021,
    bedrooms: 6,
    bathrooms: 7,
    energyRating: 'A',
    summary: "A villa of 2021 on the east side of Cap Ferrat, a short walk from the port and the Paloma beach.",
    description: [
      "Rebuilt in 2021 on the plot of a 1950s villa, keeping the olive trees that give it its name. The house sits behind a gated wall on Avenue Jean Mermoz, with the garden and pool to the rear.",
      "Living rooms are on the ground floor. Six bedroom suites are upstairs, the principal suite with a sitting area and a terrace over the garden.",
    ],
    features: [
      "Gated plot with mature olive trees",
      "Principal suite with sitting area",
      "Heated pool",
      "Staff apartment",
      "Garage for three cars",
      "Port and Paloma beach on foot",
    ],
    images: [
      { id: 'villa-front-gate', alt: "The house from the street, with the entrance gate set in a stone pillar", use: 'exterior' },
      { id: 'villa-bedroom-terrace', alt: "Bedroom with a seating area opening onto a covered terrace", use: 'residence' },
      { id: 'villa-bath-suite', alt: "Principal bathroom with a raised bath, a planted wall and twin showers", use: 'detail' },
    ],
  },
  {
    _id: 'prop-printworks',
    slug: 'montgomerie-house',
    name: 'Montgomerie House',
    buildingType: 'house',
    address: { formatted: 'Street 14, Sector E, Emirates Hills, Dubai', countryCode: 'AE', locality: 'Dubai' },
    timeZone: 'Asia/Dubai',
    location: { type: 'Point', coordinates: [55.1702, 25.0665] },
    coordinates: [55.1702, 25.0665],
    areaM2: '1450.00',
    floors: 3,
    yearBuilt: 2024,
    bedrooms: 7,
    bathrooms: 9,
    summary: "A house of 2024 in Emirates Hills, backing onto the Montgomerie golf course.",
    description: [
      "Completed in 2024 on a plot of just over four thousand square metres in Sector E of Emirates Hills. The house faces the Montgomerie course across its own garden and pool.",
      "Reception rooms are on the ground floor, seven bedroom suites on the two floors above, and a covered roof terrace looks over the course toward the Marina skyline.",
    ],
    features: [
      "Golf course frontage",
      "Seven bedroom suites",
      "Covered roof terrace",
      "Staff quarters with separate entrance",
      "Lift to all floors",
      "Garage for six cars",
    ],
    images: [
      { id: 'villa-upper-terrace', alt: "Covered upper terrace with outdoor seating and a glass balustrade", use: 'exterior' },
      { id: 'villa-guest-suite', alt: "Bedroom suite with a desk wall and an ensuite beyond", use: 'serviced' },
      { id: 'villa-bath-travertine', alt: "Travertine bathroom with a walk in shower and a floating vanity", use: 'detail' },
    ],
  },
  {
    _id: 'prop-alcantara',
    slug: 'parsley-bay-house',
    name: 'Parsley Bay House',
    buildingType: 'house',
    address: { formatted: '40 Fitzwilliam Road, Vaucluse NSW 2030', countryCode: 'AU', locality: 'Sydney' },
    timeZone: 'Australia/Sydney',
    location: { type: 'Point', coordinates: [151.2745, -33.8575] },
    coordinates: [151.2745, -33.8575],
    areaM2: '820.00',
    floors: 2,
    yearBuilt: 2022,
    bedrooms: 5,
    bathrooms: 6,
    summary: "A house of 2022 in Vaucluse, above Parsley Bay, with harbour views from the upper floor.",
    description: [
      "Built in 2022 on a level block off Fitzwilliam Road, a few minutes on foot from Parsley Bay and the harbour foreshore.",
      "The ground floor opens to the pool and garden. Five bedroom suites are upstairs, the principal suite glazed full height onto the tree canopy.",
    ],
    features: [
      "Harbour views from the upper floor",
      "Pool and landscaped garden",
      "Principal suite with full height glazing",
      "Wine room",
      "Garage for three cars",
      "Parsley Bay on foot",
    ],
    images: [
      { id: 'villa-aerial-grove', alt: "Aerial view of the neighbourhood running down to the water", use: 'exterior' },
      { id: 'villa-bedroom-garden', alt: "Bedroom with full height glazing onto the garden canopy", use: 'residence' },
      { id: 'villa-bath-planted', alt: "Soaking tub set against a planted wall and garden glazing", use: 'detail' },
    ],
  },
  {
    _id: 'prop-godown',
    slug: 'coral-island-house',
    name: 'Coral Island House',
    buildingType: 'house',
    address: { formatted: '12 Coral Island, Sentosa Cove, Singapore 098316', countryCode: 'SG', locality: 'Singapore' },
    timeZone: 'Asia/Singapore',
    location: { type: 'Point', coordinates: [103.8425, 1.2455] },
    coordinates: [103.8425, 1.2455],
    areaM2: '980.00',
    floors: 3,
    yearBuilt: 2021,
    bedrooms: 6,
    bathrooms: 7,
    summary: "A house of 2021 on Coral Island in Sentosa Cove, near the marina and the Cove village.",
    description: [
      "Completed in 2021 on a 99 year leasehold plot on Coral Island, one of the gated islands of Sentosa Cove. The marina and the Cove village are a short walk away.",
      "The pool and gym are on the garden level. Six bedroom suites are on the two floors above, with a roof terrace over the cove.",
    ],
    features: [
      "Gated island with a guarded bridge",
      "Gym opening onto the pool",
      "Roof terrace",
      "Lift to all floors",
      "Parking for four cars",
      "Marina and Cove village on foot",
    ],
    images: [
      { id: 'villa-aerial-bay', alt: "Aerial view of the house among mature trees, with the marina and the sea beyond", use: 'exterior' },
      { id: 'villa-gym-pool', alt: "Gym opening onto the pool through full height glazing", use: 'detail' },
      { id: 'villa-bath-oak', alt: "Bathroom with travertine walls, oak basin stands and a glass shower", use: 'detail' },
    ],
  },
  {
    _id: 'prop-vulkan',
    slug: 'stradella-house',
    name: 'Stradella House',
    buildingType: 'house',
    address: { formatted: '1100 Stradella Road, Los Angeles, CA 90077', countryCode: 'US', locality: 'Los Angeles' },
    timeZone: 'America/Los_Angeles',
    location: { type: 'Point', coordinates: [-118.4525, 34.0935] },
    coordinates: [-118.4525, 34.0935],
    areaM2: '1300.00',
    floors: 2,
    yearBuilt: 2024,
    bedrooms: 7,
    bathrooms: 9,
    summary: "A house of 2024 in Bel Air, on a gated lot with a motor court, a cinema and a guest house.",
    description: [
      "Completed in 2024 on a flat lot of just over an acre on Stradella Road. The house is set behind gates with a motor court and three garages to the side.",
      "Seven bedroom suites, a cinema, a gym and a wine room are across two floors, with a separate guest house by the pool.",
    ],
    features: [
      "Gated motor court",
      "Cinema room",
      "Guest house by the pool",
      "Gym and wine room",
      "Three garages",
      "Ten minutes to Sunset Boulevard",
    ],
    images: [
      { id: 'villa-garage-court', alt: "Motor court with three garages under a white roof slab", use: 'exterior' },
      { id: 'villa-cinema', alt: "Cinema room with a starlit ceiling and four lounge chairs", use: 'residence' },
      { id: 'villa-shower', alt: "Twin rain showers in a travertine wet room", use: 'detail' },
    ],
  },
  {
    _id: 'prop-fonderie',
    slug: 'monterey-house',
    name: 'Monterey House',
    buildingType: 'house',
    address: { formatted: '18 Monterey Drive, Constantia, Cape Town, 7806', countryCode: 'ZA', locality: 'Cape Town' },
    timeZone: 'Africa/Johannesburg',
    location: { type: 'Point', coordinates: [18.4375, -34.0215] },
    coordinates: [18.4375, -34.0215],
    areaM2: '650.00',
    floors: 2,
    yearBuilt: 2020,
    bedrooms: 5,
    bathrooms: 5,
    summary: "A house of 2020 in Upper Constantia, under the Constantiaberg and close to the wine estates.",
    description: [
      "Built in 2020 on a walled plot of four thousand square metres in Upper Constantia, with views up to the Constantiaberg.",
      "A double height entrance hall with an indoor garden leads to the living rooms and a study on the ground floor. Five bedroom suites are upstairs.",
    ],
    features: [
      "Double height entrance hall",
      "Indoor planted garden",
      "Study with fitted shelving",
      "Borehole and solar power",
      "Staff cottage",
      "Wine estates within five minutes",
    ],
    images: [
      { id: 'villa-entrance-hall', alt: "Entrance hall with a floating stair and an indoor planted garden", use: 'residence' },
      { id: 'villa-study', alt: "Study with a curved oak desk and lit shelving, looking onto the garden", use: 'detail' },
      { id: 'villa-dressing-suite', alt: "Dressing room with open walnut shelving and a central island", use: 'detail' },
    ],
  },
]

type SeededOffer = { _id: string; [key: string]: unknown }

const OFFERS: SeededOffer[] = [
  {
    _id: 'offer-dumbo-sale', slug: 'tigertail-house-freehold',
    propertyId: 'prop-dumbo', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '16750000.00', currency: 'USD' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-dumbo-corporate', slug: 'tigertail-house-corporate-let',
    propertyId: 'prop-dumbo', type: 'corporate_let', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '68000.00', currency: 'USD' },
    deposit: { decimal: '136000.00', currency: 'USD' },
    minTermMonths: 1, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Weekly housekeeping and pool service included',
    billsIncluded: ['Utilities', 'Broadband'],
    availableFrom: '2026-09-20',
  },
  {
    _id: 'offer-tortona-sale', slug: 'villa-mirador-freehold',
    propertyId: 'prop-tortona', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '7950000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-tortona-corporate', slug: 'villa-mirador-corporate-let',
    propertyId: 'prop-tortona', type: 'corporate_let', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '42000.00', currency: 'EUR' },
    deposit: { decimal: '84000.00', currency: 'EUR' },
    minTermMonths: 3, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Weekly housekeeping and pool service included',
    billsIncluded: ['Community fees', 'Water', 'Broadband'],
    availableFrom: '2026-10-05',
  },
  {
    _id: 'offer-houthavens-sale', slug: 'casa-da-marinha-freehold',
    propertyId: 'prop-houthavens', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '6400000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-houthavens-lease', slug: 'casa-da-marinha-long-lease',
    propertyId: 'prop-houthavens', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '22000.00', currency: 'EUR' },
    deposit: { decimal: '44000.00', currency: 'EUR' },
    minTermMonths: 12, furnished: 'unfurnished', availableFrom: '2026-11-01',
  },
  {
    _id: 'offer-eilandje-sale', slug: 'villa-les-oliviers-freehold',
    propertyId: 'prop-eilandje', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '18500000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-eilandje-lease', slug: 'villa-les-oliviers-long-lease',
    propertyId: 'prop-eilandje', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '65000.00', currency: 'EUR' },
    deposit: { decimal: '195000.00', currency: 'EUR' },
    minTermMonths: 12, furnished: 'furnished', availableFrom: '2026-10-15',
  },
  {
    _id: 'offer-printworks-sale', slug: 'montgomerie-house-freehold',
    propertyId: 'prop-printworks', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '58000000.00', currency: 'AED' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-printworks-corporate', slug: 'montgomerie-house-corporate-let',
    propertyId: 'prop-printworks', type: 'corporate_let', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '160000.00', currency: 'AED' },
    deposit: { decimal: '320000.00', currency: 'AED' },
    minTermMonths: 3, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Daily housekeeping and a driver included',
    billsIncluded: ['DEWA', 'Chiller', 'Broadband'],
    availableFrom: '2026-10-01',
  },
  {
    _id: 'offer-alcantara-sale', slug: 'parsley-bay-house-freehold',
    propertyId: 'prop-alcantara', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '24500000.00', currency: 'AUD' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-alcantara-lease', slug: 'parsley-bay-house-long-lease',
    propertyId: 'prop-alcantara', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '38000.00', currency: 'AUD' },
    deposit: { decimal: '35000.00', currency: 'AUD' },
    minTermMonths: 12, furnished: 'unfurnished', availableFrom: '2026-12-01',
  },
  {
    _id: 'offer-godown-residence', slug: 'coral-island-house-leasehold',
    propertyId: 'prop-godown', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '21800000.00', currency: 'SGD' },
    tenure: 'leasehold', leaseYearsRemaining: 94,
  },
  {
    _id: 'offer-vulkan-sale', slug: 'stradella-house-freehold',
    propertyId: 'prop-vulkan', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '32500000.00', currency: 'USD' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-vulkan-lease', slug: 'stradella-house-long-lease',
    propertyId: 'prop-vulkan', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '115000.00', currency: 'USD' },
    deposit: { decimal: '230000.00', currency: 'USD' },
    minTermMonths: 12, furnished: 'furnished', availableFrom: '2027-01-04',
  },
  {
    _id: 'offer-fonderie-lease', slug: 'monterey-house-long-lease',
    propertyId: 'prop-fonderie', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '180000.00', currency: 'ZAR' },
    deposit: { decimal: '360000.00', currency: 'ZAR' },
    minTermMonths: 12, furnished: 'unfurnished', availableFrom: '2026-10-01',
  },
]

const MONEY_FIELDS = ['price', 'rentPerMonth', 'deposit', 'serviceCharge'] as const

/**
 * Changing this makes the next boot overwrite every seeded row with this file,
 * including rows staff have edited. Staff edits made after that are protected
 * again until it changes.
 */
const SEED_REVISION = '2026-09-11-houses'

/** Offer slugs this file used to write, and the offer each now belongs to. */
const FORMER_SLUGS: Record<string, string> = {
  'houthavens-loft-9-freehold': 'offer-houthavens-sale',
  'via-tortona-officine-27-freehold': 'offer-tortona-sale',
  'via-tortona-officine-27-corporate-let': 'offer-tortona-corporate',
  'water-street-mill-70-fourth-floor': 'offer-dumbo-sale',
  'water-street-mill-70-corporate-let': 'offer-dumbo-corporate',
  'eilandje-warehouse-4-second-and-third-floors': 'offer-eilandje-lease',
  'eilandje-warehouse-4-freehold': 'offer-eilandje-sale',
  'the-print-works-third-floor': 'offer-printworks-sale',
  'the-print-works-sixth-floor-residence': 'offer-printworks-corporate',
  'alcantara-fabrica-12-third-floor': 'offer-alcantara-lease',
  'la-fonderie-oberkampf-second-and-third-floors': 'offer-fonderie-lease',
  'vulkan-stoperi-3-whole-building': 'offer-vulkan-lease',
  'vulkan-stoperi-3-freehold': 'offer-vulkan-sale',
  'keppel-godown-6-second-to-fourth-floors': 'offer-godown-residence',
  'keppel-godown-6-sixth-floor-residence': 'offer-godown-residence',
}

/**
 * Idempotent, and deliberately not authoritative after the first run.
 *
 * This used to replaceOne on every boot, which was fine while nothing but the
 * seed could write. Staff can now author offers and move them through the state
 * machine, so overwriting on restart would revert every edit and put a
 * withdrawn offer back on the site. Seeded documents are therefore inserted
 * once and left alone; the back office owns them from then on.
 *
 * Seeded rows carry a marker so a building dropped from this file can be
 * removed on the next boot without touching anything staff created.
 */
export async function seed(database: Database): Promise<{ properties: number; offers: number; removed: number }> {
  const properties = database.db.collection('properties')
  const offers = database.db.collection('offers')

  const propertyRows = PROPERTIES.map(({ _id, areaM2, ...rest }) => ({
    _id,
    content: { ...rest, area: encodeArea(areaFromM2(areaM2)), seeded: true } as Record<string, unknown>,
  }))

  const offerRows = OFFERS.map(({ _id, ...rest }) => {
    const document: Record<string, unknown> = { ...rest, seeded: true }
    for (const field of MONEY_FIELDS) {
      const value = rest[field] as { decimal: string; currency: string } | undefined
      if (!value) continue
      document[field] = encodeMoney(parseMoney(value.decimal, value.currency))
      if (field === 'price' || field === 'rentPerMonth') document.currency = value.currency
    }
    return { _id, content: document }
  })

  for (const [collection, rows] of [[properties, propertyRows], [offers, offerRows]] as const) {
    // $set alone never removes a field, so one this file stopped writing for a
    // row (a service charge on what is now a house) would stay on it for good.
    const owned = new Set(rows.flatMap((row) => Object.keys(row.content)))
    for (const { _id, content: base } of rows) {
      const content = { ...base, seedRevision: SEED_REVISION }
      await collection.updateOne({ _id: _id as never }, { $setOnInsert: content as never }, { upsert: true })
      const dropped = [...owned].filter((key) => !(key in content))
      // Refresh what this file says, unless staff have taken the row over since
      // the current revision was written.
      await collection.updateOne(
        {
          _id: _id as never,
          $or: [{ staffEditedAt: { $exists: false } }, { seedRevision: { $ne: SEED_REVISION } }],
        },
        {
          $set: content as never,
          $unset: Object.fromEntries([...dropped, 'staffEditedAt'].map((key) => [key, ''])) as never,
        },
      )
    }
  }

  // Threads, viewings, enquiries and registrations copy the offer slug (and
  // threads and viewings the name) when they are made, so a renamed offer has to
  // be carried across or every link to it from those records goes dead.
  for (const [former, offerId] of Object.entries(FORMER_SLUGS)) {
    const offer = await offers.findOne({ _id: offerId as never }, { projection: { slug: 1, propertyId: 1 } })
    const renamed = OFFERS.find((o) => o._id === offerId)
    // A row staff have taken over keeps its old slug, so its records stay put.
    if (!offer || !renamed || offer.slug !== renamed.slug) continue
    const property = await properties.findOne({ _id: offer.propertyId as never }, { projection: { name: 1, address: 1 } })
    if (!property) continue
    const offerName = `${property.name}, ${property.address.locality}`
    for (const name of ['threads', 'viewings']) {
      await database.db.collection(name).updateMany({ offerSlug: former }, { $set: { offerSlug: offer.slug, offerName } })
    }
    for (const name of ['enquiries', 'users']) {
      await database.db.collection(name).updateMany({ offer: former }, { $set: { offer: offer.slug } })
    }
  }

  const keepProperties = PROPERTIES.map((p) => p._id)
  const keepOffers = OFFERS.map((o) => o._id)

  // Rows written before the marker existed do not carry it, and a prune that
  // only trusted the marker left them behind forever. The id is the other
  // signal: this file writes literal prop- and offer- ids, while anything staff
  // author gets a uuid. Backfilling the marker on what is still listed makes it
  // true from here on.
  await properties.updateMany(
    { _id: { $in: keepProperties as never[] }, seeded: { $exists: false } },
    { $set: { seeded: true } },
  )
  await offers.updateMany(
    { _id: { $in: keepOffers as never[] }, seeded: { $exists: false } },
    { $set: { seeded: true } },
  )

  const stale = (keep: string[], prefix: string) => ({
    _id: { $nin: keep as never[] },
    $or: [{ seeded: true }, { _id: { $regex: `^${prefix}-` } }],
  })

  const goneOffers = await offers.deleteMany(stale(keepOffers, 'offer') as never)
  const goneProperties = await properties.deleteMany(stale(keepProperties, 'prop') as never)

  return {
    properties: PROPERTIES.length,
    offers: OFFERS.length,
    removed: goneOffers.deletedCount + goneProperties.deletedCount,
  }
}

if (import.meta.main) {
  const config = loadConfig(process.env)
  const database = await connect(config)
  await applySchema(database.db)
  const counts = await seed(database)
  console.log(`seeded ${counts.properties} properties and ${counts.offers} offers` + (counts.removed ? `, removed ${counts.removed} no longer listed` : ''))
  await database.close()
}
