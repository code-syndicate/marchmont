import { loadConfig } from '../src/config'
import { connect, type Database } from '../src/db/client'
import { encodeArea, encodeMoney } from '../src/db/codecs'
import { applySchema } from '../src/db/indexes'
import { areaFromM2 } from '../src/domain/area'
import { parseMoney } from '../src/domain/money'

type Seeded = { _id: string; areaM2: string; [key: string]: unknown }

const PROPERTIES: Seeded[] = [
  {
    _id: 'prop-eilandje',
    slug: 'eilandje-warehouse-4',
    name: 'Eilandje Warehouse 4',
    buildingType: 'office',
    address: { formatted: 'Napoleonkaai 4, 2000 Antwerp', countryCode: 'BE', locality: 'Antwerp' },
    timeZone: 'Europe/Brussels',
    location: { type: 'Point', coordinates: [4.4092, 51.232] },
    coordinates: [4.4092, 51.232],
    areaM2: '2480.00',
    floors: 5,
    yearBuilt: 1897,
    energyRating: 'B',
    summary: "A dock warehouse of 1897 on the Napoleonkaai, converted to office floors with the crane beams left in place.",
    description: [
      "Built in 1897 to store colonial goods off the Willemdok, and converted in 2018. The brick shell, the cast iron columns and the external crane beams are original and protected; everything behind them is new.",
      "Floors two and three are offered together. Both are column spaced at just under five metres, which is what makes them convert cleanly to open studio without partitions fighting the structure.",
    ],
    features: [
      "Original crane beams retained",
      "Cast iron column grid",
      "Five metre column spacing",
      "Clerestory glazing to the north",
      "Bicycle store for 60",
      "Eight minutes from Antwerpen-Centraal",
    ],
    images: [
      { id: 'photo-1738463267273-7263f3a47f92', alt: "Restored brick warehouse with clock tower on the Eilandje" },
      { id: 'photo-1773069459477-e9fe9d6eeb60', alt: "Office floor with exposed brick columns and tall windows" },
      { id: 'photo-1785381523158-86cbb796ef2b', alt: "Empty office floor with exposed structure, ready for fit out" },
      { id: 'photo-1776238491015-54add7928b7f', alt: "Weathered brick wall with exposed pipework" },
    ],
  },
  {
    _id: 'prop-houthavens',
    slug: 'houthavens-loft-9',
    name: 'Houthavens Loft 9',
    buildingType: 'house',
    address: { formatted: 'Houthavenkade 9, 1014 Amsterdam', countryCode: 'NL', locality: 'Amsterdam' },
    timeZone: 'Europe/Amsterdam',
    location: { type: 'Point', coordinates: [4.8722, 52.3927] },
    coordinates: [4.8722, 52.3927],
    areaM2: '268.00',
    floors: 2,
    yearBuilt: 1912,
    bedrooms: 3,
    bathrooms: 2,
    energyRating: 'C',
    summary: "A timber wharf shed of 1912 cut into six lofts. This is the end one, with windows on three sides.",
    description: [
      "The Houthavens sheds took Baltic timber off the water until the 1980s. Six lofts were cut into this one in 2019 and this is the end unit, which is the only one glazed on three elevations.",
      "The living floor runs the full depth under the original roof trusses. A mezzanine sits over the kitchen without touching the outer walls, which the consent required.",
    ],
    features: [
      "Windows on three elevations",
      "Original roof trusses exposed",
      "Mezzanine over the kitchen",
      "Six metre ceiling to the ridge",
      "Mooring for one boat",
      "Twelve minutes to Centraal by ferry",
    ],
    images: [
      { id: 'photo-1710547284002-255fc868e88b', alt: "Brick warehouse with rows of tall factory windows" },
      { id: 'photo-1773069459487-3d2d7bb4532e', alt: "Loft with exposed brick, timber posts and factory windows" },
      { id: 'photo-1706967413741-b8461ff8d370', alt: "Living room with tall factory windows and exposed structure" },
      { id: 'photo-1764726331208-71cb385ab08c', alt: "Late afternoon light across an empty loft floor" },
    ],
  },
  {
    _id: 'prop-printworks',
    slug: 'the-print-works',
    name: 'The Print Works',
    buildingType: 'mixed',
    address: { formatted: 'Bache Walk, London E2', countryCode: 'GB', locality: 'London' },
    timeZone: 'Europe/London',
    location: { type: 'Point', coordinates: [-0.0748, 51.529] },
    coordinates: [-0.0748, 51.529],
    areaM2: '3150.00',
    floors: 7,
    yearBuilt: 1903,
    energyRating: 'C',
    summary: "A 1903 printing works off Bache Walk. Creative office below, four loft residences above.",
    description: [
      "A jobbing printer occupied this building from 1903 until 1994 and the goods lift, the loading bay and the ink hoist are all still here. Conversion completed in 2021.",
      "Floors one to four are office, let by the floor. Floors five to seven hold four loft residences reached by a separate entrance on the yard side.",
    ],
    features: [
      "Original goods lift in service",
      "Loading bay retained as the entrance",
      "Separate residential core",
      "Roof terrace to the top floor",
      "Secure yard parking for nine",
      "Six minutes from Bethnal Green",
    ],
    images: [
      { id: 'photo-1774957108662-80d697d70844', alt: "Tall brick facade with many windows against the sky" },
      { id: 'photo-1505873242700-f289a29e1e0f', alt: "Loft interior with exposed brick, timber posts and open living area" },
      { id: 'photo-1740446569003-0746d2a4c485', alt: "Brick walled loft with a timber ladder to a sleeping loft" },
      { id: 'photo-1727639707159-eb0c8c779996', alt: "Warm brick stairwell lit by a tall window" },
    ],
  },
  {
    _id: 'prop-tortona',
    slug: 'via-tortona-officine-27',
    name: 'Officine Tortona 27',
    buildingType: 'house',
    address: { formatted: 'Via Tortona 27, 20144 Milan', countryCode: 'IT', locality: 'Milan' },
    timeZone: 'Europe/Rome',
    location: { type: 'Point', coordinates: [9.168, 45.452] },
    coordinates: [9.168, 45.452],
    areaM2: '340.00',
    floors: 3,
    yearBuilt: 1921,
    bedrooms: 4,
    bathrooms: 3,
    energyRating: 'D',
    summary: "A 1921 machine shop in Tortona, converted to a single residence over three floors.",
    description: [
      "Built as a machine shop in 1921 and worked until 1987. The current owner converted it as one house rather than splitting it, which is now unusual on this stretch.",
      "The ground floor is one room of a hundred and ten square metres under the original north light. Bedrooms sit above on two floors reached by the works stair.",
    ],
    features: [
      "North light over the ground floor",
      "Original works stair",
      "Single dwelling, not subdivided",
      "Courtyard with mature planting",
      "Garage for two",
      "Tortona and Navigli on foot",
    ],
    images: [
      { id: 'photo-1649982294301-21a0668505a4', alt: "Red brick industrial building with mature trees in front" },
      { id: 'photo-1740446568848-bfb43e66bfd2', alt: "Loft with sleeping mezzanine and factory windows" },
      { id: 'photo-1740446569677-a79c3186a16b', alt: "Compact loft with brick wall and timber bed platform" },
      { id: 'photo-1786051390136-d705fe0e7309', alt: "Bright living room with ceiling fans and tall windows" },
    ],
  },
  {
    _id: 'prop-alcantara',
    slug: 'alcantara-fabrica-12',
    name: 'Fabrica Alcantara 12',
    buildingType: 'office',
    address: { formatted: 'Rua Rodrigues Faria 12, 1300 Lisbon', countryCode: 'PT', locality: 'Lisbon' },
    timeZone: 'Europe/Lisbon',
    location: { type: 'Point', coordinates: [-9.177, 38.702] },
    coordinates: [-9.177, 38.702],
    areaM2: '1650.00',
    floors: 4,
    yearBuilt: 1888,
    energyRating: 'C',
    summary: "An 1888 textile works in Alcantara, four floors of creative office under the original roof lights.",
    description: [
      "A cotton spinning works of 1888, one of the last in Alcantara still in single ownership. The saw tooth roof and its north lights were restored in 2020 rather than replaced.",
      "The third floor is offered whole and takes the full run of roof lights, which gives it even light from mid morning to dusk with no direct sun on a screen.",
    ],
    features: [
      "Saw tooth roof lights restored",
      "Even north light all day",
      "Original brick and iron structure",
      "Roof terrace over the river",
      "Fibre to the building",
      "Alcantara-Mar station at the door",
    ],
    images: [
      { id: 'photo-1675711329496-ae122ca149a3', alt: "Brick industrial building with mature trees in front" },
      { id: 'photo-1690368358248-6ab7d1921e27', alt: "Large interior with rows of tall factory windows" },
      { id: 'photo-1771530789155-b1f03fbf82b5', alt: "Empty floor with polished concrete and clerestory light" },
      { id: 'photo-1692696746783-14e5e56a6387', alt: "Empty interior with exposed brick and timber ceiling structure" },
    ],
  },
  {
    _id: 'prop-fonderie',
    slug: 'la-fonderie-oberkampf',
    name: 'La Fonderie Oberkampf',
    buildingType: 'office',
    address: { formatted: 'Passage Charles Dallery 6, 75011 Paris', countryCode: 'FR', locality: 'Paris' },
    timeZone: 'Europe/Paris',
    location: { type: 'Point', coordinates: [2.376, 48.857] },
    coordinates: [2.376, 48.857],
    areaM2: '1980.00',
    floors: 5,
    yearBuilt: 1908,
    energyRating: 'B',
    summary: "A 1908 iron foundry off Oberkampf, five floors around a glazed light well.",
    description: [
      "Cast iron was poured here until 1962. The building keeps its glazed light well, its riveted frame and the wide bay spacing the moulding floor needed.",
      "The second and third floors are offered together and share the light well, so both sides of each floor take daylight. There is no internal column between them.",
    ],
    features: [
      "Glazed light well through five floors",
      "Riveted iron frame exposed",
      "No internal columns on the let floors",
      "Courtyard entrance off the passage",
      "Showers and cycle store",
      "Parmentier on line 3",
    ],
    images: [
      { id: 'photo-1710547284002-255fc868e88b', alt: "Brick foundry building with rows of tall windows" },
      { id: 'photo-1785381523158-86cbb796ef2b', alt: "Empty office floor with exposed structure, ready for fit out" },
      { id: 'photo-1772300704502-410f0fbd43bb', alt: "Spacious empty floor with polished concrete" },
      { id: 'photo-1634834576400-56f5e1ad8db8', alt: "Empty warehouse floor with a long run of windows" },
    ],
  },
  {
    _id: 'prop-yaba',
    slug: 'yaba-works-14',
    name: 'Yaba Works 14',
    buildingType: 'office',
    address: { formatted: '14 Commercial Avenue, Yaba, Lagos', countryCode: 'NG', locality: 'Lagos' },
    timeZone: 'Africa/Lagos',
    location: { type: 'Point', coordinates: [3.3792, 6.5095] },
    coordinates: [3.3792, 6.5095],
    areaM2: '2200.00',
    floors: 4,
    yearBuilt: 1974,
    summary: "A 1974 works building on Commercial Avenue, rebuilt in 2022 as serviced creative office.",
    description: [
      "Built as a printing and packaging works in 1974 and stripped back to frame in 2021. What was kept is the frame, the loading yard and the double height ground floor.",
      "Power is the point here: the building runs on a solar array with battery storage and a generator behind it, so the floors do not go dark and the tenants do not each run their own plant.",
    ],
    features: [
      "Solar array with battery storage",
      "Standby generator behind it",
      "Double height ground floor",
      "Loading yard retained",
      "Fibre from two carriers",
      "Yaba tech cluster on foot",
    ],
    images: [
      { id: 'photo-1738463267273-7263f3a47f92', alt: "Brick industrial building with a clock tower" },
      { id: 'photo-1772300704502-410f0fbd43bb', alt: "Spacious empty floor with polished concrete" },
      { id: 'photo-1771530789155-b1f03fbf82b5', alt: "Empty floor with polished concrete and clerestory light" },
      { id: 'photo-1773069459477-e9fe9d6eeb60', alt: "Interior with exposed brick columns and tall windows" },
    ],
  },
  {
    _id: 'prop-godown',
    slug: 'keppel-godown-6',
    name: 'Keppel Godown 6',
    buildingType: 'mixed',
    address: { formatted: '6 Keppel Road, Singapore 089065', countryCode: 'SG', locality: 'Singapore' },
    timeZone: 'Asia/Singapore',
    location: { type: 'Point', coordinates: [103.841, 1.273] },
    coordinates: [103.841, 1.273],
    areaM2: '2650.00',
    floors: 6,
    yearBuilt: 1936,
    energyRating: 'A',
    summary: "A 1936 godown on Keppel Road, conserved frontage, offices below and two residences at the top.",
    description: [
      "A dockside godown of 1936, conserved in full to the street and rebuilt behind. The timber shutters and the painted shipping marks on the facade were kept under the conservation consent.",
      "Floors two to four are office. The fifth and sixth are two residences with their own lift and a shared roof garden looking over the harbour.",
    ],
    features: [
      "Conserved 1936 frontage",
      "Original shipping marks retained",
      "Private lift to the residences",
      "Roof garden over the harbour",
      "End of trip facilities",
      "Tanjong Pagar MRT nearby",
    ],
    images: [
      { id: 'photo-1774957108662-80d697d70844', alt: "Tall warehouse facade with many windows against the sky" },
      { id: 'photo-1773069459487-3d2d7bb4532e', alt: "Loft with exposed brick, timber posts and factory windows" },
      { id: 'photo-1786051390136-d705fe0e7309', alt: "Bright living room with ceiling fans and tall windows" },
      { id: 'photo-1706967413741-b8461ff8d370', alt: "Living room with tall factory windows and exposed structure" },
    ],
  },
  {
    _id: 'prop-dumbo',
    slug: 'water-street-mill-70',
    name: '70 Water Street Mill',
    buildingType: 'house',
    address: { formatted: '70 Water Street, Brooklyn, NY 11201', countryCode: 'US', locality: 'New York' },
    timeZone: 'America/New_York',
    location: { type: 'Point', coordinates: [-73.9905, 40.7033] },
    coordinates: [-73.9905, 40.7033],
    areaM2: '295.00',
    floors: 1,
    yearBuilt: 1891,
    bedrooms: 3,
    bathrooms: 2,
    summary: "A full floor loft in an 1891 paper mill in Dumbo, cast iron columns and river light.",
    description: [
      "The mill made paper board from 1891 until the 1970s and was among the first buildings on the block to convert. This is the fourth floor, held as one loft.",
      "Windows run the length of the north and west walls, so the bridge and the water are in the room for most of the day. The cast iron column line is untouched.",
    ],
    features: [
      "Full floor, single loft",
      "Cast iron columns untouched",
      "North and west glazing",
      "Bridge and river outlook",
      "Original freight elevator",
      "York Street on the F",
    ],
    images: [
      { id: 'photo-1649982294301-21a0668505a4', alt: "Red brick warehouse exterior with trees" },
      { id: 'photo-1505873242700-f289a29e1e0f', alt: "Loft interior with exposed brick and open living area" },
      { id: 'photo-1740446569003-0746d2a4c485', alt: "Brick walled loft with a timber ladder to a sleeping loft" },
      { id: 'photo-1764726331208-71cb385ab08c', alt: "Late afternoon light across an empty loft floor" },
    ],
  },
]

type SeededOffer = { _id: string; [key: string]: unknown }

const OFFERS: SeededOffer[] = [
  {
    _id: 'offer-eilandje-lease', slug: 'eilandje-warehouse-4-second-and-third-floors',
    propertyId: 'prop-eilandje', type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Second and third floors',
    rentPerMonth: { decimal: '31500.00', currency: 'EUR' },
    serviceCharge: { decimal: '74000.00', currency: 'EUR' },
    deposit: { decimal: '94500.00', currency: 'EUR' },
    minTermMonths: 36, furnished: 'unfurnished', availableFrom: '2026-11-01',
  },
  {
    _id: 'offer-eilandje-sale', slug: 'eilandje-warehouse-4-freehold',
    propertyId: 'prop-eilandje', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '14200000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-houthavens-sale', slug: 'houthavens-loft-9-freehold',
    propertyId: 'prop-houthavens', type: 'sale', status: 'live', scope: 'unit',
    scopeLabel: 'End loft',
    price: { decimal: '2950000.00', currency: 'EUR' },
    tenure: 'freehold',
  },
  {
    _id: 'offer-printworks-lease', slug: 'the-print-works-third-floor',
    propertyId: 'prop-printworks', type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Third floor, office',
    rentPerMonth: { decimal: '27500.00', currency: 'GBP' },
    serviceCharge: { decimal: '58000.00', currency: 'GBP' },
    deposit: { decimal: '82500.00', currency: 'GBP' },
    minTermMonths: 24, furnished: 'unfurnished', availableFrom: '2026-10-15',
  },
  {
    _id: 'offer-printworks-corporate', slug: 'the-print-works-sixth-floor-residence',
    propertyId: 'prop-printworks', type: 'corporate_let', status: 'live', scope: 'unit',
    scopeLabel: 'Sixth floor residence',
    rentPerMonth: { decimal: '9800.00', currency: 'GBP' },
    deposit: { decimal: '19600.00', currency: 'GBP' },
    minTermMonths: 2, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Weekly housekeeping included',
    billsIncluded: ['Council tax', 'Water', 'Broadband'],
    availableFrom: '2026-09-28',
  },
  {
    _id: 'offer-tortona-sale', slug: 'via-tortona-officine-27-freehold',
    propertyId: 'prop-tortona', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '4650000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-tortona-corporate', slug: 'via-tortona-officine-27-corporate-let',
    propertyId: 'prop-tortona', type: 'corporate_let', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    rentPerMonth: { decimal: '13200.00', currency: 'EUR' },
    deposit: { decimal: '26400.00', currency: 'EUR' },
    minTermMonths: 3, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Fortnightly housekeeping included',
    billsIncluded: ['Condominio', 'Water', 'Broadband'],
    availableFrom: '2026-10-05',
  },
  {
    _id: 'offer-alcantara-lease', slug: 'alcantara-fabrica-12-third-floor',
    propertyId: 'prop-alcantara', type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Third floor',
    rentPerMonth: { decimal: '16400.00', currency: 'EUR' },
    serviceCharge: { decimal: '31000.00', currency: 'EUR' },
    deposit: { decimal: '49200.00', currency: 'EUR' },
    minTermMonths: 24, furnished: 'part furnished', availableFrom: '2026-09-15',
  },
  {
    _id: 'offer-fonderie-lease', slug: 'la-fonderie-oberkampf-second-and-third-floors',
    propertyId: 'prop-fonderie', type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Second and third floors',
    rentPerMonth: { decimal: '38000.00', currency: 'EUR' },
    serviceCharge: { decimal: '82000.00', currency: 'EUR' },
    deposit: { decimal: '114000.00', currency: 'EUR' },
    minTermMonths: 36, furnished: 'unfurnished', availableFrom: '2027-01-04',
  },
  {
    _id: 'offer-yaba-lease', slug: 'yaba-works-14-whole-building',
    propertyId: 'prop-yaba', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    rentPerMonth: { decimal: '18500000.00', currency: 'NGN' },
    serviceCharge: { decimal: '42000000.00', currency: 'NGN' },
    deposit: { decimal: '55500000.00', currency: 'NGN' },
    minTermMonths: 24, furnished: 'part furnished', availableFrom: '2026-10-01',
  },
  {
    _id: 'offer-yaba-sale', slug: 'yaba-works-14-leasehold',
    propertyId: 'prop-yaba', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '2350000000.00', currency: 'NGN' },
    tenure: 'leasehold', leaseYearsRemaining: 82, chainStatus: 'No onward chain',
  },
  {
    _id: 'offer-godown-lease', slug: 'keppel-godown-6-second-to-fourth-floors',
    propertyId: 'prop-godown', type: 'long_lease', status: 'live', scope: 'floor',
    scopeLabel: 'Second to fourth floors',
    rentPerMonth: { decimal: '92000.00', currency: 'SGD' },
    serviceCharge: { decimal: '184000.00', currency: 'SGD' },
    deposit: { decimal: '276000.00', currency: 'SGD' },
    minTermMonths: 36, furnished: 'unfurnished', availableFrom: '2026-12-01',
  },
  {
    _id: 'offer-godown-residence', slug: 'keppel-godown-6-sixth-floor-residence',
    propertyId: 'prop-godown', type: 'sale', status: 'live', scope: 'unit',
    scopeLabel: 'Sixth floor residence',
    price: { decimal: '11400000.00', currency: 'SGD' },
    tenure: 'leasehold', leaseYearsRemaining: 71,
  },
  {
    _id: 'offer-dumbo-sale', slug: 'water-street-mill-70-fourth-floor',
    propertyId: 'prop-dumbo', type: 'sale', status: 'live', scope: 'unit',
    scopeLabel: 'Fourth floor loft',
    price: { decimal: '4275000.00', currency: 'USD' },
    tenure: 'commonhold', serviceCharge: { decimal: '31200.00', currency: 'USD' },
  },
  {
    _id: 'offer-dumbo-corporate', slug: 'water-street-mill-70-corporate-let',
    propertyId: 'prop-dumbo', type: 'corporate_let', status: 'live', scope: 'unit',
    scopeLabel: 'Fourth floor loft',
    rentPerMonth: { decimal: '14500.00', currency: 'USD' },
    deposit: { decimal: '29000.00', currency: 'USD' },
    minTermMonths: 1, maxTermMonths: 6, furnished: 'furnished',
    servicedLevel: 'Weekly housekeeping included',
    billsIncluded: ['Utilities', 'Broadband'],
    availableFrom: '2026-09-20',
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
