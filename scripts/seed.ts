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
      { id: 'photo-1738463267273-7263f3a47f92', alt: "Restored brick warehouse with clock tower on the Eilandje", use: 'exterior' },
      { id: 'photo-1773069459477-e9fe9d6eeb60', alt: "Office floor with exposed brick columns and tall windows", use: 'office' },
      { id: 'photo-1785381523158-86cbb796ef2b', alt: "Empty office floor with exposed structure, ready for fit out", use: 'office' },
      { id: 'photo-1776238491015-54add7928b7f', alt: "Weathered brick wall with exposed pipework", use: 'detail' },
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
    summary: "A house of 2023 in Quinta da Marinha, with a planted hall, a gym that opens onto the pool and a covered upper terrace.",
    description: [
      "Completed in 2023 on a walled plot in Quinta da Marinha, between Cascais and the Guincho coast. The street side is travertine with a long band of glass at the upper floor, and the front door opens into a double height hall built around a planted garden.",
      "The gym, the pool and the garden are on one level. Upstairs, five bedroom suites share a covered terrace facing the pines. Cascais station and the marina are ten minutes by car.",
    ],
    features: [
      "Double height entrance hall",
      "Indoor planted garden",
      "Gym opening onto the pool",
      "Covered upper terrace",
      "Travertine wet rooms",
      "Ten minutes to Cascais by car",
    ],
    images: [
      { id: 'villa-side-elevation', alt: "Travertine and glass elevation with a first floor terrace", use: 'exterior' },
      { id: 'villa-entrance-hall', alt: "Entrance hall with a floating stair and an indoor planted garden", use: 'residence' },
      { id: 'villa-upper-terrace', alt: "Covered upper terrace with outdoor seating and a glass balustrade", use: 'residence' },
      { id: 'villa-gym-pool', alt: "Gym opening onto the pool through full height glazing", use: 'detail' },
      { id: 'villa-gym', alt: "Gym in oak and walnut along a glazed garden wall", use: 'detail' },
      { id: 'villa-bath-oak', alt: "Bathroom with travertine walls, oak basin stands and a glass shower", use: 'detail' },
      { id: 'villa-shower', alt: "Twin rain showers in a travertine wet room", use: 'detail' },
      { id: 'villa-dressing-suite', alt: "Dressing room with open walnut shelving and a central island", use: 'detail' },
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
      { id: 'photo-1774957108662-80d697d70844', alt: "Tall brick facade with many windows against the sky", use: 'exterior' },
      { id: 'photo-1786051390136-d705fe0e7309', alt: "Bright living room with ceiling fans and tall windows", use: 'serviced' },
      { id: 'photo-1690368358248-6ab7d1921e27', alt: "Large office interior with rows of tall factory windows", use: 'office' },
      { id: 'photo-1727639707159-eb0c8c779996', alt: "Warm brick stairwell lit by a tall window", use: 'detail' },
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
    summary: "A villa of 2022 in Sierra Blanca, above the Golden Mile, with a covered pool terrace, a cinema and a three car garage.",
    description: [
      "Built in 2022 on a south facing plot in Sierra Blanca, one of the gated estates on the hill above the Golden Mile. The house is two floors of travertine and glass under deep white eaves, with the pool terrace on the garden side.",
      "The living room, study and cinema are on the ground floor. Five bedroom suites are upstairs, and the principal suite opens onto its own covered terrace. The sea is in view from the upper floor.",
    ],
    features: [
      "Covered terrace with outdoor kitchen",
      "Twenty metre pool",
      "Cinema room",
      "Study with fitted shelving",
      "Three car garage",
      "Gated estate with a staffed entrance",
    ],
    images: [
      { id: 'villa-pool-terrace', alt: "Covered terrace with an outdoor kitchen beside a long pool, the house beyond", use: 'exterior' },
      { id: 'villa-library-room', alt: "Living room with a walnut shelving wall and floor to ceiling glass", use: 'serviced' },
      { id: 'villa-bedroom-terrace', alt: "Bedroom with a seating area opening onto a covered terrace", use: 'residence' },
      { id: 'villa-bedroom-garden', alt: "Bedroom with full height glazing onto the garden canopy", use: 'residence' },
      { id: 'villa-study', alt: "Study with a curved oak desk and lit shelving, looking onto the garden", use: 'detail' },
      { id: 'villa-cinema', alt: "Cinema room with a starlit ceiling and four lounge chairs", use: 'detail' },
      { id: 'villa-bath-travertine', alt: "Travertine bathroom with a walk in shower and a floating vanity", use: 'detail' },
      { id: 'villa-dressing-room', alt: "Dressing room in walnut with a glass topped island", use: 'detail' },
      { id: 'villa-garage-court', alt: "Side court with three garages under a white roof slab", use: 'detail' },
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
      { id: 'photo-1675711329496-ae122ca149a3', alt: "Brick industrial building with mature trees in front", use: 'exterior' },
      { id: 'photo-1772300704502-410f0fbd43bb', alt: "Spacious empty office floor with polished concrete", use: 'office' },
      { id: 'photo-1634834576400-56f5e1ad8db8', alt: "Empty office floor with a long run of windows", use: 'office' },
      { id: 'photo-1692696746783-14e5e56a6387', alt: "Empty interior with exposed brick and timber ceiling structure", use: 'detail' },
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
      { id: 'photo-1710547284002-255fc868e88b', alt: "Brick foundry building with rows of tall factory windows", use: 'exterior' },
      { id: 'photo-1785381523158-86cbb796ef2b', alt: "Empty office floor with exposed structure, ready for fit out", use: 'office' },
      { id: 'photo-1690368358248-6ab7d1921e27', alt: "Large office interior with rows of tall factory windows", use: 'office' },
      { id: 'photo-1776238491015-54add7928b7f', alt: "Weathered brick wall with exposed pipework", use: 'detail' },
    ],
  },
  {
    _id: 'prop-vulkan',
    slug: 'vulkan-stoperi-3',
    name: 'Vulkan Støperi 3',
    buildingType: 'office',
    address: { formatted: 'Maridalsveien 3, 0175 Oslo', countryCode: 'NO', locality: 'Oslo', region: 'Vulkan' },
    timeZone: 'Europe/Oslo',
    location: { type: 'Point', coordinates: [10.7515, 59.923] },
    coordinates: [10.7515, 59.923],
    areaM2: '2200.00',
    floors: 4,
    yearBuilt: 1898,
    summary: "An 1898 iron foundry on the Akerselva, converted in 2021 to office floors under the original roof trusses.",
    description: [
      "Built as an iron foundry in 1898 on the east bank of the Akerselva and worked until 1974. The riveted steel trusses, the travelling crane rail and the tall north glazing are all original and were restored rather than replaced.",
      "The conversion added a new insulated envelope inside the masonry, so the floors hold temperature through a Norwegian winter without touching the elevations. Heat comes from the river through a ground source loop.",
    ],
    features: [
      "Riveted steel roof trusses restored",
      "Travelling crane rail retained",
      "North glazing the length of the building",
      "Ground source heat from the Akerselva",
      "Passive house level envelope",
      "Vulkan and Mathallen at the door",
    ],
    images: [
      { id: 'photo-1738463267273-7263f3a47f92', alt: "Restored brick foundry with a clock tower on the Akerselva", use: 'exterior' },
      { id: 'photo-1773069459477-e9fe9d6eeb60', alt: "Office floor with exposed brick columns and tall windows", use: 'office' },
      { id: 'photo-1772300704502-410f0fbd43bb', alt: "Spacious empty office floor with polished concrete", use: 'office' },
      { id: 'photo-1771530789155-b1f03fbf82b5', alt: "Empty floor with polished concrete and clerestory light", use: 'detail' },
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
      { id: 'photo-1774957108662-80d697d70844', alt: "Tall brick godown facade with many windows against the sky", use: 'exterior' },
      { id: 'photo-1634834576400-56f5e1ad8db8', alt: "Empty office floor with a long run of windows", use: 'office' },
      { id: 'photo-1740446569003-0746d2a4c485', alt: "Brick walled loft with a timber ladder to a sleeping loft", use: 'residence' },
      { id: 'photo-1727639707159-eb0c8c779996', alt: "Warm brick stairwell lit by a tall window", use: 'detail' },
    ],
  },
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
    summary: "A house of 2023 on a wooded lot in Coconut Grove, two floors under white roof slabs, ten minutes on foot from Biscayne Bay.",
    description: [
      "Completed in 2023 on a lot of just under half an acre off Tigertail Avenue. The house is poured concrete with timber cladding and a travertine base, set back behind a slatted fence and a line of mature trees.",
      "The ground floor runs from the kitchen to the family room in one open plan, glazed on both sides. Six bedroom suites are upstairs, each with its own bathroom. The principal bathroom has a sunken bath against a planted wall.",
    ],
    features: [
      "Six bedroom suites",
      "Walnut panelled family room",
      "Kitchen island in oak and stone",
      "Principal bath with a planted wall",
      "Pool and garden under mature oaks",
      "Ten minutes on foot to the bay",
    ],
    images: [
      { id: 'villa-street-facade', alt: "Two storey house behind a black slatted fence, with white roof slabs and timber cladding", use: 'exterior' },
      { id: 'villa-family-room', alt: "Family room with walnut panelled walls, low sofas and a high band of garden glazing", use: 'serviced' },
      { id: 'villa-kitchen', alt: "Kitchen with a long timber island, open to the dining and living areas", use: 'residence' },
      { id: 'villa-front-gate', alt: "The house from the street, with the entrance gate set in a stone pillar", use: 'exterior' },
      { id: 'villa-aerial-bay', alt: "Aerial view of the house among mature trees, with Biscayne Bay beyond", use: 'exterior' },
      { id: 'villa-guest-suite', alt: "Bedroom suite with a desk wall and an ensuite beyond", use: 'residence' },
      { id: 'villa-bath-suite', alt: "Principal bathroom with a raised bath, a planted wall and twin showers", use: 'detail' },
      { id: 'villa-bath-vanity', alt: "Principal bathroom vanity in walnut with green glass basins", use: 'detail' },
      { id: 'villa-bath-planted', alt: "Soaking tub set against a planted wall and garden glazing", use: 'detail' },
      { id: 'villa-aerial-grove', alt: "Aerial view of the neighbourhood running down to the bay", use: 'detail' },
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
    _id: 'offer-houthavens-sale', slug: 'casa-da-marinha-freehold',
    propertyId: 'prop-houthavens', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole house',
    price: { decimal: '6400000.00', currency: 'EUR' },
    tenure: 'freehold', chainStatus: 'No onward chain',
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
    _id: 'offer-vulkan-lease', slug: 'vulkan-stoperi-3-whole-building',
    propertyId: 'prop-vulkan', type: 'long_lease', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    rentPerMonth: { decimal: '465000.00', currency: 'NOK' },
    serviceCharge: { decimal: '1540000.00', currency: 'NOK' },
    deposit: { decimal: '1395000.00', currency: 'NOK' },
    minTermMonths: 24, furnished: 'unfurnished', availableFrom: '2026-10-01',
  },
  {
    _id: 'offer-vulkan-sale', slug: 'vulkan-stoperi-3-freehold',
    propertyId: 'prop-vulkan', type: 'sale', status: 'live', scope: 'whole',
    scopeLabel: 'Whole building',
    price: { decimal: '165000000.00', currency: 'NOK' },
    tenure: 'freehold', chainStatus: 'No onward chain',
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
]

const MONEY_FIELDS = ['price', 'rentPerMonth', 'deposit', 'serviceCharge'] as const

/**
 * Changing this makes the next boot overwrite every seeded row with this file,
 * including rows staff have edited. Staff edits made after that are protected
 * again until it changes.
 */
const SEED_REVISION = '2026-09-11-villas'

/** Offer slugs this file used to write, and the offer each now belongs to. */
const FORMER_SLUGS: Record<string, string> = {
  'houthavens-loft-9-freehold': 'offer-houthavens-sale',
  'via-tortona-officine-27-freehold': 'offer-tortona-sale',
  'via-tortona-officine-27-corporate-let': 'offer-tortona-corporate',
  'water-street-mill-70-fourth-floor': 'offer-dumbo-sale',
  'water-street-mill-70-corporate-let': 'offer-dumbo-corporate',
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
